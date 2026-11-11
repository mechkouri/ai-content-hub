import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ContentKind, ContentStatus, Prisma, SourceStatus } from '@prisma/client';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { ClaimWarning, findUnsupportedClaims, flattenStrings, seoChecks } from './content-guard';
import { PromptContext, buildPrompt, buildTranslationPrompt } from './content-prompts';
import {
  ArticleContent,
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
  ) {}

  // ---------- helpers ----------

  private async loadSource(orgId: string, sourceId: string) {
    // Scoped by organization: another tenant's source is simply "not found".
    const source = await this.prisma.source.findFirst({
      where: { id: sourceId, organizationId: orgId },
    });
    if (!source) throw new NotFoundException('Source not found');
    if (source.status !== SourceStatus.EXTRACTED) {
      throw new UnprocessableEntityException({
        code: 'SOURCE_NOT_READY',
        message: 'Extract and review the facts of this source before creating content.',
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
    if (kind === 'ARTICLE')
      content.slug = sanitizeSlug(content.slug, content.seoTitle ?? content.h1);
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
    return {
      piece,
      ...(piece.kind === ContentKind.ARTICLE
        ? {
            seoChecks: seoChecks(piece.content as ArticleContent, {
              primaryKeyword: opts.primaryKeyword,
              length: opts.length ?? 'medium',
            }),
          }
        : {}),
    };
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
        message: 'This source has no verified facts yet. Review and confirm its facts first.',
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
    const out = await this.ai.generateJson(
      { orgId, userId },
      { system, prompt, maxTokens, temperature: 0.6, schema: generationEnvelope(dto.kind) },
    );

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

    const { system, prompt, maxTokens } = buildTranslationPrompt(
      kind,
      original.content,
      target,
      original.language,
    );
    const out = await this.ai.generateJson(
      { orgId, userId },
      { system, prompt, maxTokens, temperature: 0.2, schema: generationEnvelope(kind) },
    );

    const content = this.postProcess(kind, out.data.content as any);
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

  list(orgId: string, filter: { sourceId?: string; kind?: Kind }) {
    return this.prisma.contentPiece.findMany({
      where: {
        organizationId: orgId,
        ...(filter.sourceId ? { sourceId: filter.sourceId } : {}),
        ...(filter.kind ? { kind: filter.kind } : {}),
      },
      select: {
        id: true,
        sourceId: true,
        kind: true,
        status: true,
        language: true,
        title: true,
        edited: true,
        translatedFromId: true,
        warnings: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
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
  async update(orgId: string, id: string, rawContent: unknown) {
    const piece = await this.find(orgId, id);
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

    const updated = await this.prisma.contentPiece.update({
      where: { id: piece.id },
      data: {
        content: content as Prisma.InputJsonValue,
        title: titleOf(kind, content),
        warnings: warnings as unknown as Prisma.InputJsonValue,
        status: warnings.length ? ContentStatus.NEEDS_REVIEW : ContentStatus.DRAFT,
        edited: true,
      },
    });
    return this.present(updated);
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
