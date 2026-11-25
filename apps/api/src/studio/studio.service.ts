import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApprovalStatus, ContentKind, ContentStatus, Prisma, SourceStatus } from '@prisma/client';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { ApprovalsService } from './approvals.service';
import { fitMeta } from './fit-meta';
import { checkLinks, linksIn } from './link-check';
import { briefOf, buildSeoPrompt, SeoField, seoSuggestionSchema, usable } from './seo-assist';
import { protectPictures, restorePictures } from './translation-pictures';
import {
  ClaimWarning,
  findUnsupportedClaims,
  flattenStrings,
  seoChecks,
  seoScore,
} from './content-guard';
import { PromptContext, buildPrompt, buildTranslationPrompt } from './content-prompts';
import {
  ARTICLE_WORD_TARGET,
  ArticleContent,
  articleWordCount,
  GenerationOptions,
  Kind,
  LANGUAGES,
  Language,
  generationEnvelope,
  normalizeLinkedin,
  sanitizeSlug,
  schemaFor,
  titleOf,
} from './content-schemas';

/** A first draft under this share of its word target is asked for again, once. */
const SHORT_ARTICLE_RATIO = 0.8;

const isLanguage = (v: unknown): v is Language => LANGUAGES.includes(v as Language);

/** The main body text of a piece, used to notice when a "translation" came back unchanged. */
function mainText(kind: Kind, c: any): string {
  const raw =
    kind === 'ARTICLE' ? c?.introduction : kind === 'INSTAGRAM' ? c?.caption : c?.postText;
  return String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

@Injectable()
export class StudioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly approvals: ApprovalsService,
  ) {}

  /** Replaceable in tests so no real network is used. */
  linkDeps: import('./link-check').LinkCheckDeps = {};

  // ---------- helpers ----------

  /**
   * Free models often stop an article early. When the first draft is clearly under its target, ask once
   * more, telling the model exactly how far it fell short, and keep whichever draft is longer.
   * The second attempt is best effort: if it fails (limits, timeouts), the first draft is still used.
   */
  private async lengthenIfShort<T extends { data: { content: unknown } }>(
    orgId: string,
    userId: string,
    request: Parameters<AiService['generateJson']>[1],
    first: T,
    options: GenerationOptions,
  ): Promise<T> {
    const target = ARTICLE_WORD_TARGET[options.length];
    const words = (r: T) => {
      try {
        return articleWordCount(r.data.content as ArticleContent);
      } catch {
        return 0;
      }
    };
    const firstWords = words(first);
    if (firstWords >= target * SHORT_ARTICLE_RATIO) return first;
    try {
      const second = (await this.ai.generateJson(
        { orgId, userId },
        {
          ...request,
          prompt: `${request.prompt}\n\nIMPORTANT: your previous draft had only ${firstWords} words, but the article body must be AT LEAST ${target} words. Write the complete article again, longer: develop every section with full paragraphs and add useful general explanation (no new facts, dates, numbers or links).`,
        },
      )) as unknown as T;
      return words(second) > firstWords ? second : first;
    } catch {
      return first;
    }
  }

  private async loadSource(orgId: string, sourceId: string) {
    // Scoped by organization: another tenant's source is simply "not found".
    const source = await this.prisma.source.findFirst({
      where: { id: sourceId, organizationId: orgId },
    });
    if (!source) throw new NotFoundException('Document not found');
    if (source.status !== SourceStatus.EXTRACTED) {
      throw new UnprocessableEntityException({
        code: 'SOURCE_NOT_READY',
        message: 'Read and check this document before creating content.',
      });
    }
    return source;
  }

  private async context(orgId: string, sourceId: string) {
    const [org, brand, facts] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id: orgId } }),
      this.prisma.brandKit.findFirst({ where: { organizationId: orgId, isActive: true } }),
      this.prisma.sourceFact.findMany({ where: { sourceId }, orderBy: { createdAt: 'asc' } }),
    ]);
    return {
      org,
      brand,
      verified: facts.filter((f) => f.verified),
      unverifiedCount: facts.filter((f) => !f.verified).length,
    };
  }

  /** Text the content is allowed to contain concrete details from. */
  private corpus(
    verified: { value: string; quote: string | null }[],
    org: { name: string } | null,
    brand: { websiteUrl: string | null; description: string | null; socialUrls: unknown } | null,
    options: Partial<GenerationOptions>,
    extra: string[] = [],
  ): string[] {
    return [
      ...verified.flatMap((f) => [f.value, f.quote ?? '']),
      org?.name ?? '',
      brand?.websiteUrl ?? '',
      brand?.description ?? '',
      ...Object.values((brand?.socialUrls as Record<string, string>) ?? {}),
      options.instructions ?? '',
      options.audience ?? '',
      options.primaryKeyword ?? '',
      ...extra,
    ];
  }

  private postProcess(kind: Kind, content: any) {
    if (kind === 'ARTICLE') {
      content.slug = sanitizeSlug(content.slug, content.seoTitle ?? content.h1);
      if (typeof content.metaDescription === 'string')
        content.metaDescription = fitMeta(content.metaDescription);
    }
    if (kind === 'LINKEDIN') return normalizeLinkedin(content);
    return content;
  }

  /** Warnings for claims not found in the allowed text; an unverified Facebook link is removed outright. */
  private assess(kind: Kind, content: any, allowed: string[]) {
    const warnings: ClaimWarning[] = findUnsupportedClaims(content, allowed);
    if (
      kind === 'FACEBOOK' &&
      content.link &&
      findUnsupportedClaims({ link: content.link }, allowed).length
    ) {
      content.link = null;
      warnings.push({
        type: 'url',
        value: 'link',
        message: 'An unverified link was removed from the post.',
      });
    }
    return warnings;
  }

  private present(piece: any) {
    const opts = (piece.options ?? {}) as Partial<GenerationOptions>;
    if (piece.kind !== ContentKind.ARTICLE) return { piece };
    const checks = seoChecks(piece.content as ArticleContent, {
      primaryKeyword: opts.primaryKeyword,
      length: opts.length ?? 'medium',
    });
    return { piece, seoChecks: checks, seoScore: seoScore(checks) };
  }

  // ---------- generation ----------

  async generate(
    orgId: string,
    userId: string,
    dto: { sourceId: string; kind: Kind; options: GenerationOptions },
  ) {
    const source = await this.loadSource(orgId, dto.sourceId);
    const { org, brand, verified, unverifiedCount } = await this.context(orgId, source.id);
    if (!verified.length) {
      throw new UnprocessableEntityException({
        code: 'NO_VERIFIED_FACTS',
        message: 'This document has no confirmed details yet. Check and confirm its details first.',
      });
    }

    const brandLang = brand?.defaultLanguage;
    const language: Language =
      dto.options.language ??
      (isLanguage(brandLang) ? brandLang : isLanguage(source.language) ? source.language : 'en');
    const options: GenerationOptions = { ...dto.options, language };

    const refs = verified.map((f, i) => ({
      ref: `F${i + 1}`,
      id: f.id,
      kind: f.kind,
      value: f.value,
    }));
    const ctx: PromptContext = {
      orgName: org?.name ?? 'The organization',
      brand,
      source: {
        title: source.title,
        classification: source.classification,
        summary: source.summary,
      },
      facts: refs.map(({ ref, kind, value }) => ({ ref, kind, value })),
      options,
      language,
    };
    const { system, prompt, maxTokens } = buildPrompt(dto.kind, ctx);

    // AI errors (quota, rate limit, not configured...) propagate with their own clear codes.
    const request = {
      system,
      prompt,
      maxTokens,
      temperature: 0.6,
      schema: generationEnvelope(dto.kind),
    };
    let out = await this.ai.generateJson({ orgId, userId }, request);
    if (dto.kind === 'ARTICLE')
      out = await this.lengthenIfShort(orgId, userId, request, out, options);

    const content = this.postProcess(dto.kind, out.data.content as any);
    const allowed = this.corpus(verified, org, brand, options);
    const warnings = this.assess(dto.kind, content, allowed);
    const usedFactIds = [
      ...new Set(
        out.data.usedFacts
          .map((r) => refs.find((x) => x.ref === r.toUpperCase().trim())?.id)
          .filter(Boolean),
      ),
    ] as string[];

    const piece = await this.prisma.contentPiece.create({
      data: {
        organizationId: orgId,
        sourceId: source.id,
        kind: dto.kind,
        status: warnings.length ? ContentStatus.NEEDS_REVIEW : ContentStatus.DRAFT,
        language,
        title: titleOf(dto.kind, content),
        content: content as Prisma.InputJsonValue,
        options: options as unknown as Prisma.InputJsonValue,
        warnings: warnings as unknown as Prisma.InputJsonValue,
        usedFactIds,
        model: out.model,
        provider: out.provider,
        createdById: userId,
      },
    });
    return {
      ...this.present(piece),
      factsAvailable: verified.length,
      excludedUnverified: unverifiedCount,
    };
  }

  async translate(orgId: string, userId: string, id: string, target: Language) {
    const original = await this.find(orgId, id);
    if (original.language === target)
      throw new BadRequestException('The content is already in this language.');
    const kind = original.kind as Kind;
    const { org, brand, verified } = await this.context(orgId, original.sourceId);

    // Pictures inside an article are taken out for the translator and put back afterwards, so the translation
    // keeps them (with their description translated) instead of the model mangling the syntax.
    const protectedArticle = kind === 'ARTICLE' ? protectPictures(original.content) : null;
    const { system, prompt, maxTokens } = buildTranslationPrompt(
      kind,
      protectedArticle ? protectedArticle.content : original.content,
      target,
      original.language,
    );
    const out = await this.ai.generateJson(
      { orgId, userId },
      { system, prompt, maxTokens, temperature: 0.2, schema: generationEnvelope(kind) },
    );

    const content = this.postProcess(
      kind,
      protectedArticle
        ? restorePictures(out.data.content, protectedArticle.pictures)
        : (out.data.content as any),
    );
    // Lazy models sometimes hand the text back untranslated: refuse that instead of saving a fake translation.
    const before = mainText(kind, original.content);
    if (before.length > 0 && before === mainText(kind, content)) {
      throw new HttpException(
        {
          code: 'TRANSLATION_UNCHANGED',
          message: 'The AI returned the text without translating it. Please try again.',
          retryable: true,
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
    // Fields that must not change in translation.
    if (kind === 'ARTICLE') content.slug = (original.content as any).slug;
    if (kind === 'LINKEDIN') content.imageMode = (original.content as any).imageMode;
    const options = {
      ...((original.options as object) ?? {}),
      language: target,
    } as Partial<GenerationOptions>;
    // Numbers/links in the translation may match either the verified facts or the original text.
    const allowed = this.corpus(verified, org, brand, options, flattenStrings(original.content));
    const warnings = this.assess(kind, content, allowed);

    const piece = await this.prisma.contentPiece.create({
      data: {
        organizationId: orgId,
        sourceId: original.sourceId,
        kind: original.kind,
        status: warnings.length ? ContentStatus.NEEDS_REVIEW : ContentStatus.DRAFT,
        language: target,
        title: titleOf(kind, content),
        content: content as Prisma.InputJsonValue,
        options: options as Prisma.InputJsonValue,
        warnings: warnings as unknown as Prisma.InputJsonValue,
        usedFactIds: original.usedFactIds as Prisma.InputJsonValue,
        translatedFromId: original.id,
        model: out.model,
        provider: out.provider,
        createdById: userId,
      },
    });
    return this.present(piece);
  }

  // ---------- reading & editing ----------

  private async find(orgId: string, id: string) {
    const piece = await this.prisma.contentPiece.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!piece) throw new NotFoundException('Content not found');
    return piece;
  }

  list(
    orgId: string,
    filter: {
      sourceId?: string;
      kind?: Kind;
      approvalStatus?: ApprovalStatus;
      campaignId?: string;
      scheduledFrom?: Date;
      scheduledTo?: Date;
    },
  ) {
    return this.prisma.contentPiece.findMany({
      where: {
        organizationId: orgId,
        ...(filter.sourceId ? { sourceId: filter.sourceId } : {}),
        ...(filter.kind ? { kind: filter.kind } : {}),
        ...(filter.approvalStatus ? { approvalStatus: filter.approvalStatus } : {}),
        ...(filter.campaignId ? { campaignId: filter.campaignId } : {}),
        ...(filter.scheduledFrom || filter.scheduledTo
          ? {
              scheduledFor: {
                ...(filter.scheduledFrom ? { gte: filter.scheduledFrom } : {}),
                ...(filter.scheduledTo ? { lt: filter.scheduledTo } : {}),
              },
            }
          : {}),
      },
      select: {
        id: true,
        sourceId: true,
        kind: true,
        status: true,
        approvalStatus: true,
        scheduledFor: true,
        campaignId: true,
        language: true,
        title: true,
        edited: true,
        translatedFromId: true,
        warnings: true,
        createdAt: true,
        updatedAt: true,
      },
      // A calendar query reads in date order; the normal list shows newest first.
      orderBy:
        filter.scheduledFrom || filter.scheduledTo
          ? { scheduledFor: 'asc' }
          : { createdAt: 'desc' },
      take: 200,
    });
  }

  async detail(orgId: string, id: string) {
    const piece = await this.find(orgId, id);
    const source = await this.prisma.source.findFirst({
      where: { id: piece.sourceId, organizationId: orgId },
      select: { id: true, title: true },
    });
    return { ...this.present(piece), source };
  }

  /** Replaces the content with a human-edited version, re-validating it and re-checking its claims. */
  /** Validates edited content and finds claims that are not in the verified facts. Saves nothing. */
  private async evaluate(orgId: string, piece: any, rawContent: unknown) {
    const kind = piece.kind as Kind;
    const parsed = schemaFor(kind).safeParse(rawContent);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    const content = this.postProcess(kind, parsed.data as any);
    const { org, brand, verified } = await this.context(orgId, piece.sourceId);
    const options = (piece.options ?? {}) as Partial<GenerationOptions>;
    const extra = piece.translatedFromId
      ? await this.originalText(orgId, piece.translatedFromId)
      : [];
    const warnings = this.assess(kind, content, this.corpus(verified, org, brand, options, extra));
    return { kind, content, warnings };
  }

  /** Live check while editing: the same verdict saving would give, without saving and without any AI call. */
  async check(orgId: string, id: string, rawContent: unknown, keyword?: string | null) {
    const piece = await this.find(orgId, id);
    const { kind, content, warnings } = await this.evaluate(orgId, piece, rawContent);
    const seo =
      kind === ContentKind.ARTICLE
        ? this.seoFor(content as ArticleContent, piece.options, keyword)
        : {};
    return {
      warnings,
      status: warnings.length ? ContentStatus.NEEDS_REVIEW : ContentStatus.DRAFT,
      ...seo,
    };
  }

  /** The SEO checks for a text, with the focus keyword given now or, failing that, the one saved earlier. */
  private seoFor(content: ArticleContent, options: unknown, keyword?: string | null) {
    const opts = (options ?? {}) as Partial<GenerationOptions>;
    const checks = seoChecks(content, {
      primaryKeyword: keyword === undefined ? opts.primaryKeyword : (keyword ?? undefined),
      length: opts.length ?? 'medium',
    });
    return { seoChecks: checks, seoScore: seoScore(checks) };
  }

  async update(
    orgId: string,
    id: string,
    rawContent: unknown,
    actorId: string,
    keyword?: string | null,
  ) {
    const piece = await this.find(orgId, id);
    const { kind, content, warnings } = await this.evaluate(orgId, piece, rawContent);

    const options = {
      ...((piece.options ?? {}) as Record<string, unknown>),
      // Clearing the box removes the keyword; leaving it out of the request keeps the saved one.
      ...(keyword === undefined ? {} : { primaryKeyword: keyword?.trim() || undefined }),
    };
    const updated = await this.prisma.contentPiece.update({
      where: { id: piece.id },
      data: {
        content: content as Prisma.InputJsonValue,
        title: titleOf(kind, content),
        warnings: warnings as unknown as Prisma.InputJsonValue,
        status: warnings.length ? ContentStatus.NEEDS_REVIEW : ContentStatus.DRAFT,
        edited: true,
        ...(keyword === undefined ? {} : { options: options as Prisma.InputJsonValue }),
      },
    });
    // An edit voids any pending review or approval: the reviewed text is no longer the saved text.
    const final = (await this.approvals.invalidateAfterEdit(orgId, piece, actorId)) ?? updated;
    return this.present(final);
  }

  /**
   * Ideas for an article's SEO title, meta description or focus keyword, written by the AI from the article itself.
   * Anything that mentions a date, number, link or email the article and its verified facts do not support is
   * dropped, and so is anything too short or too long to pass the SEO checks. Nothing is saved: the person chooses.
   */
  async seoSuggest(
    orgId: string,
    userId: string,
    id: string,
    input: { field: SeoField; keyword?: string | null; content?: unknown },
  ) {
    const piece = await this.find(orgId, id);
    if (piece.kind !== ContentKind.ARTICLE) {
      throw new BadRequestException('SEO suggestions are for articles');
    }
    const draft =
      input.content && typeof input.content === 'object' ? input.content : piece.content;
    const language = (isLanguage(piece.language) ? piece.language : 'en') as Language;
    const keyword = (
      input.keyword ??
      ((piece.options as any)?.primaryKeyword as string | undefined) ??
      ''
    )
      .toString()
      .trim()
      .slice(0, 80);
    const { org, brand, verified } = await this.context(orgId, piece.sourceId);
    const { system, prompt, maxTokens } = buildSeoPrompt(
      input.field,
      briefOf(draft),
      language,
      keyword || undefined,
      org?.name ?? '',
    );
    const out = await this.ai.generateJson(
      { orgId, userId },
      { system, prompt, maxTokens, temperature: 0.6, schema: seoSuggestionSchema },
    );
    const allowed = this.corpus(
      verified,
      org,
      brand,
      { primaryKeyword: keyword || undefined },
      flattenStrings(draft),
    );
    const supported = out.data.suggestions.filter(
      (text) => findUnsupportedClaims({ text }, allowed).length === 0,
    );
    return { field: input.field, suggestions: usable(input.field, supported) };
  }

  /**
   * Checks the links of an article (the draft being edited, or the saved text) and says which work, which move,
   * which are broken and which could not be checked. Only public web addresses are ever contacted.
   */
  async checkArticleLinks(orgId: string, id: string, draft?: unknown) {
    const piece = await this.find(orgId, id);
    if (piece.kind !== ContentKind.ARTICLE) {
      throw new BadRequestException('Link checks are for articles');
    }
    const content: any = draft && typeof draft === 'object' ? draft : piece.content;
    const texts = [
      content?.introduction,
      content?.conclusion,
      ...(Array.isArray(content?.sections) ? content.sections : []).flatMap((x: any) => [
        x?.body,
        ...(Array.isArray(x?.subsections) ? x.subsections : []).map((y: any) => y?.body),
      ]),
      ...(Array.isArray(content?.faq) ? content.faq : []).map((f: any) => f?.answer),
    ].filter((t): t is string => typeof t === 'string');
    const urls = linksIn(texts);
    return { checked: urls.length, results: await checkLinks(urls, this.linkDeps) };
  }

  private async originalText(orgId: string, id: string): Promise<string[]> {
    const o = await this.prisma.contentPiece.findFirst({ where: { id, organizationId: orgId } });
    return o ? flattenStrings(o.content) : [];
  }

  async remove(orgId: string, id: string) {
    const piece = await this.find(orgId, id);
    await this.prisma.contentPiece.delete({ where: { id: piece.id } });
    return { removed: true };
  }
}
