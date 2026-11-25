import {
  BadRequestException,
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ContentKind } from '@prisma/client';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { FetchFailedError, FetchedPage, UnsafeUrlError } from '../sources/safe-fetch';
import { PAGE_FETCHER, PageFetcher, RobotsDisallowedError } from '../sources/sources.service';
import { Language } from '../studio/content-schemas';
import { buildPlanPrompt, cleanPlan, planSchema } from './plan';
import { auditPage, auditScore } from './site-audit';

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
  ) {}

  /** Checks a public web page. Costs no AI generation. */
  async audit(url: string) {
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
    const result = auditPage(page.body, page.finalUrl);
    return { url: page.finalUrl, score: auditScore(result.checks), ...result };
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
