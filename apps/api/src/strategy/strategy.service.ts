import {
  BadRequestException,
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ContentKind } from '@prisma/client';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  FetchFailedError,
  FetchedPage,
  UnsafeUrlError,
  safeFetchText,
} from '../sources/safe-fetch';
import { PAGE_FETCHER, PageFetcher, RobotsDisallowedError } from '../sources/sources.service';
import { Language } from '../studio/content-schemas';
import { detectLanguage } from '../sources/extract-text';
import { buildPlanPrompt, cleanPlan, planSchema } from './plan';
import { buildSnippetPrompt, cleanSnippet, pageBrief, snippetSchema, snippetTags } from './snippet';
import { auditPage, auditScore } from './site-audit';
import { CheckedPage, combine, pickPages } from './site-crawl';

/** Reads a site's sitemap, or null when there is none. */
export type SitemapFetcher = (origin: string) => Promise<string | null>;
export const SITEMAP_FETCHER = Symbol('SITEMAP_FETCHER');
export const defaultSitemapFetcher: SitemapFetcher = async (origin) => {
  try {
    const found = await safeFetchText(`${origin}/sitemap.xml`, {
      allowedTypes: null,
      timeoutMs: 5000,
    });
    return found.body;
  } catch {
    return null;
  }
};

/** The home page plus this many others: enough to see patterns without loading the client's site much. */
const MORE_PAGES = 9;
/** A slow website must not keep the request open for minutes. */
const TIME_BUDGET_MS = 40_000;

export interface PlanRequest {
  business: string;
  location?: string;
  audience?: string;
  website?: string;
  language: Language;
}

@Injectable()
export class StrategyService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAGE_FETCHER) private readonly pages: PageFetcher,
    private readonly ai: AiService,
    @Inject(SITEMAP_FETCHER) private readonly sitemaps: SitemapFetcher,
  ) {}

  /** Checks a public web page. Costs no AI generation. */
  async audit(url: string) {
    const page = await this.load(url);
    const result = auditPage(page.body, page.finalUrl);
    return { url: page.finalUrl, score: auditScore(result.checks), ...result };
  }

  /**
   * Checks the home page and a few other pages of the same site, one at a time. Pages that cannot be read are
   * listed instead of failing the whole check. Costs no AI generation.
   */
  async auditSite(url: string) {
    const started = Date.now();
    const home = await this.load(url);
    const sitemap = await this.sitemaps(new URL(home.finalUrl).origin);
    const checked: CheckedPage[] = [];
    const unreadable: string[] = [];
    const seen = new Set<string>();
    const add = (page: FetchedPage) => {
      if (seen.has(page.finalUrl)) return; // two addresses that lead to the same page count once
      seen.add(page.finalUrl);
      const result = auditPage(page.body, page.finalUrl);
      checked.push({
        url: page.finalUrl,
        title: result.title,
        score: auditScore(result.checks),
        checks: result.checks,
      });
    };
    add(home);
    for (const next of pickPages(home.finalUrl, home.body, sitemap, MORE_PAGES)) {
      if (Date.now() - started > TIME_BUDGET_MS) break;
      try {
        add(await this.load(next));
      } catch (e) {
        if (!(e instanceof BadRequestException || e instanceof UnprocessableEntityException))
          throw e;
        unreadable.push(next);
      }
    }
    return {
      url: home.finalUrl,
      hasSitemap: !!sitemap?.includes('<loc>'),
      unreadable,
      ...combine(checked),
    };
  }

  /**
   * A better title and description for one page, written from what the page says, with the lines to paste.
   * Uses one AI generation. The page's own language wins over the screen language.
   */
  async suggestSnippet(orgId: string, userId: string, url: string, fallback: Language) {
    const loaded = await this.load(url);
    const page = pageBrief(loaded.body);
    if (page.text.length < 40) {
      throw new UnprocessableEntityException('This page has too little text to work from.');
    }
    const detected = detectLanguage(page.text);
    const language: Language = detected === 'unknown' ? fallback : detected;
    const out = await this.ai.generateJson(
      { orgId, userId },
      { ...buildSnippetPrompt(page, language), temperature: 0.5, schema: snippetSchema },
    );
    const { titles, descriptions } = cleanSnippet(out.data, page);
    return {
      url: loaded.finalUrl,
      current: page.title,
      titles,
      descriptions,
      tags: titles[0] && descriptions[0] ? snippetTags(titles[0], descriptions[0]) : null,
    };
  }

  private async load(url: string): Promise<FetchedPage> {
    let page: FetchedPage;
    try {
      page = await this.pages.fetch(url);
    } catch (e) {
      if (e instanceof UnsafeUrlError)
        throw new BadRequestException('This URL is not allowed. Use a public http(s) web page.');
      if (e instanceof RobotsDisallowedError) {
        throw new UnprocessableEntityException(
          'This website asks not to be checked automatically.',
        );
      }
      if (e instanceof FetchFailedError) throw new UnprocessableEntityException(e.message);
      throw e;
    }
    if (!/html/i.test(page.contentType)) {
      throw new UnprocessableEntityException('That address is not a web page.');
    }
    return page;
  }

  /** A keyword and blog plan. The website check is optional: if it fails, the plan is still made. */
  async plan(orgId: string, userId: string, input: PlanRequest) {
    let site: Awaited<ReturnType<StrategyService['audit']>> | null = null;
    let siteError: string | null = null;
    if (input.website) {
      try {
        site = await this.audit(input.website);
      } catch (e) {
        if (!(e instanceof BadRequestException || e instanceof UnprocessableEntityException))
          throw e;
        siteError = e.message;
      }
    }
    const [org, written] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } }),
      this.prisma.contentPiece.findMany({
        where: { organizationId: orgId, kind: ContentKind.ARTICLE },
        select: { title: true },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    ]);
    const { system, prompt, maxTokens } = buildPlanPrompt({
      ...input,
      siteName: org?.name ?? '',
      website: site ? { title: site.title, headings: site.headings } : undefined,
    });
    const out = await this.ai.generateJson(
      { orgId, userId },
      { system, prompt, maxTokens, temperature: 0.4, schema: planSchema },
    );
    return {
      ...cleanPlan(
        out.data,
        written.map((w) => w.title),
      ),
      site,
      siteError,
      model: out.model,
    };
  }
}
