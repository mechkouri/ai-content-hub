import {
  BadRequestException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SourceStatus, SourceType } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { sanitizeFilename } from '../storage/image-type';
import { STORAGE, StorageProvider } from '../storage/storage';
import {
  EXTRACTION_SYSTEM,
  buildExtractionPrompt,
  extractionSchema,
  missingInformation,
  verifyFact,
} from './fact-extraction';
import {
  MAX_FILE_BYTES,
  MAX_TEXT_CHARS,
  cleanText,
  detectFileKind,
  detectLanguage,
  extractFromFile,
  extractFromHtml,
  titleFromText,
} from './extract-text';
import {
  FetchFailedError,
  FetchedPage,
  UnsafeUrlError,
  isAllowedByRobots,
  safeFetchText,
} from './safe-fetch';

export class RobotsDisallowedError extends FetchFailedError {}

export interface PageFetcher {
  fetch(url: string): Promise<FetchedPage>;
}
export const PAGE_FETCHER = Symbol('PAGE_FETCHER');
export const defaultPageFetcher: PageFetcher = {
  async fetch(url) {
    if (!(await isAllowedByRobots(url))) throw new RobotsDisallowedError('robots');
    return safeFetchText(url);
  },
};

const MIN_TEXT_CHARS = 20;

@Injectable()
export class SourcesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE) private readonly storage: StorageProvider,
    @Inject(PAGE_FETCHER) private readonly pages: PageFetcher,
    private readonly ai: AiService,
  ) {}

  // ---------- creation ----------

  createFromText(orgId: string, userId: string, input: { text: string; title?: string }) {
    return this.create(orgId, userId, {
      type: SourceType.TEXT,
      text: cleanText(input.text),
      title: input.title?.trim() || undefined,
    });
  }

  async createFromFile(
    orgId: string,
    userId: string,
    file?: { buffer: Buffer; originalname: string },
  ) {
    if (!file?.buffer?.length) throw new BadRequestException('A non-empty "file" is required');
    if (file.buffer.length > MAX_FILE_BYTES)
      throw new PayloadTooLargeException('Max file size is 10 MB');
    const kind = detectFileKind(file.buffer);
    if (!kind) throw new BadRequestException('Only PDF and DOCX files are supported');

    const text = await extractFromFile(file.buffer, kind);
    const fileName = sanitizeFilename(file.originalname);
    const storageKey = `${orgId}/sources/${randomUUID()}.${kind === 'PDF' ? 'pdf' : 'docx'}`;
    await this.storage.put(storageKey, file.buffer);
    try {
      return await this.create(orgId, userId, {
        type: kind === 'PDF' ? SourceType.PDF : SourceType.DOCX,
        text,
        title: undefined,
        fileName,
        mimeType:
          kind === 'PDF'
            ? 'application/pdf'
            : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        sizeBytes: file.buffer.length,
        storageKey,
      });
    } catch (e) {
      await this.storage.delete(storageKey);
      throw e;
    }
  }

  async createFromUrl(orgId: string, userId: string, url: string) {
    let page: FetchedPage;
    try {
      page = await this.pages.fetch(url);
    } catch (e) {
      if (e instanceof UnsafeUrlError)
        throw new BadRequestException('This URL is not allowed. Use a public http(s) web page.');
      if (e instanceof RobotsDisallowedError) {
        throw new UnprocessableEntityException(
          'This website asks not to be imported automatically. Paste the text instead.',
        );
      }
      if (e instanceof FetchFailedError) throw new UnprocessableEntityException(e.message);
      throw e;
    }
    const isHtml = /html/i.test(page.contentType);
    const extracted = isHtml
      ? extractFromHtml(page.body)
      : { title: null, text: cleanText(page.body) };
    return this.create(orgId, userId, {
      type: SourceType.URL,
      text: extracted.text,
      title: extracted.title ?? undefined,
      url: page.finalUrl,
    });
  }

  private async create(
    orgId: string,
    userId: string,
    s: {
      type: SourceType;
      text: string;
      title?: string;
      url?: string;
      fileName?: string;
      mimeType?: string;
      sizeBytes?: number;
      storageKey?: string;
    },
  ) {
    if (s.text.length < MIN_TEXT_CHARS) {
      throw new BadRequestException(
        s.type === SourceType.PDF
          ? 'No readable text found in this PDF. Scanned documents are not supported yet.'
          : 'Not enough text to work with (at least 20 characters).',
      );
    }
    if (s.text.length > MAX_TEXT_CHARS)
      throw new PayloadTooLargeException('The text is too long (max 200,000 characters)');

    const language = detectLanguage(s.text);
    const source = await this.prisma.source.create({
      data: {
        organizationId: orgId,
        type: s.type,
        status: SourceStatus.TEXT_READY,
        title: (s.title ?? s.fileName ?? titleFromText(s.text)).slice(0, 200),
        language: language === 'unknown' ? null : language,
        originalText: s.text,
        url: s.url ?? null,
        fileName: s.fileName ?? null,
        mimeType: s.mimeType ?? null,
        sizeBytes: s.sizeBytes ?? null,
        storageKey: s.storageKey ?? null,
        createdById: userId,
      },
    });
    // The source is saved first, so a failed or rate-limited AI step never loses the user's input.
    const extraction = await this.runExtraction(orgId, userId, source.id);
    return { ...(await this.detail(orgId, source.id)), extraction };
  }

  // ---------- extraction ----------

  /** Runs AI fact extraction. Never throws for AI problems: the outcome is reported so the caller can retry later. */
  async runExtraction(orgId: string, userId: string, sourceId: string) {
    const source = await this.find(orgId, sourceId);
    const { prompt, truncated } = buildExtractionPrompt(source.originalText);
    try {
      const out = await this.ai.generateJson(
        { orgId, userId },
        {
          system: EXTRACTION_SYSTEM,
          prompt,
          temperature: 0,
          maxTokens: 3000,
          schema: extractionSchema,
        },
      );
      const seen = new Set<string>();
      const facts = out.data.facts
        .filter((f) => {
          const key = `${f.kind}|${f.value.toLowerCase()}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .map((f) => ({
          sourceId,
          kind: f.kind,
          value: f.value,
          quote: f.quote,
          verified: verifyFact(source.originalText, f),
        }));
      const heuristic = source.language;
      await this.prisma.$transaction([
        this.prisma.sourceFact.deleteMany({ where: { sourceId, manual: false } }),
        this.prisma.sourceFact.createMany({ data: facts }),
        this.prisma.source.update({
          where: { id: sourceId },
          data: {
            status: SourceStatus.EXTRACTED,
            classification: out.data.classification,
            summary: out.data.summary ?? null,
            language: heuristic ?? out.data.language?.toLowerCase().slice(0, 10) ?? null,
            truncated,
            extractionError: null,
          },
        }),
      ]);
      return { ok: true as const };
    } catch (e) {
      const body = e instanceof HttpException ? (e.getResponse() as Record<string, unknown>) : {};
      const code = typeof body.code === 'string' ? body.code : 'AI_ERROR';
      const message = typeof body.message === 'string' ? body.message : 'AI extraction failed.';
      await this.prisma.source.update({
        where: { id: sourceId },
        data: { extractionError: `${code}: ${message}`.slice(0, 500) },
      });
      return { ok: false as const, code, message, retryable: body.retryable !== false };
    }
  }

  async extract(orgId: string, userId: string, sourceId: string) {
    const extraction = await this.runExtraction(orgId, userId, sourceId);
    return { ...(await this.detail(orgId, sourceId)), extraction };
  }

  // ---------- reading ----------

  private async find(orgId: string, id: string) {
    // Always scoped by organization: another tenant's id is simply "not found".
    const source = await this.prisma.source.findFirst({ where: { id, organizationId: orgId } });
    if (!source) throw new NotFoundException('Document not found');
    return source;
  }

  list(orgId: string) {
    return this.prisma.source.findMany({
      where: { organizationId: orgId },
      select: {
        id: true,
        type: true,
        status: true,
        title: true,
        language: true,
        classification: true,
        url: true,
        fileName: true,
        createdAt: true,
        extractionError: true,
        _count: { select: { facts: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async detail(orgId: string, id: string) {
    const source = await this.find(orgId, id);
    const facts = await this.prisma.sourceFact.findMany({
      where: { sourceId: id },
      orderBy: { createdAt: 'asc' },
    });
    return {
      source,
      facts,
      missing:
        source.status === SourceStatus.EXTRACTED
          ? missingInformation(
              source.classification,
              facts.map((f) => f.kind),
            )
          : [],
      unverifiedCount: facts.filter((f) => !f.verified).length,
    };
  }

  // ---------- manual fact editing ----------

  private async findFact(orgId: string, sourceId: string, factId: string) {
    await this.find(orgId, sourceId);
    const fact = await this.prisma.sourceFact.findFirst({ where: { id: factId, sourceId } });
    if (!fact) throw new NotFoundException('Detail not found');
    return fact;
  }

  async updateFact(
    orgId: string,
    sourceId: string,
    factId: string,
    dto: { value?: string; kind?: string; quote?: string | null; verified?: boolean },
  ) {
    const fact = await this.findFact(orgId, sourceId, factId);
    const changedContent =
      (dto.value !== undefined && dto.value !== fact.value) ||
      (dto.kind !== undefined && dto.kind !== fact.kind);
    return this.prisma.sourceFact.update({
      where: { id: fact.id },
      data: {
        ...(dto.value !== undefined ? { value: dto.value } : {}),
        ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
        ...(dto.quote !== undefined ? { quote: dto.quote } : {}),
        // A person reviewing or editing a fact is the verification.
        ...(changedContent ? { edited: true, verified: true } : {}),
        ...(dto.verified !== undefined ? { verified: dto.verified } : {}),
      },
    });
  }

  async addFact(orgId: string, sourceId: string, dto: { kind: string; value: string }) {
    await this.find(orgId, sourceId);
    return this.prisma.sourceFact.create({
      data: {
        sourceId,
        kind: dto.kind,
        value: dto.value,
        quote: null,
        verified: true,
        manual: true,
      },
    });
  }

  async deleteFact(orgId: string, sourceId: string, factId: string) {
    const fact = await this.findFact(orgId, sourceId, factId);
    await this.prisma.sourceFact.delete({ where: { id: fact.id } });
    return { removed: true };
  }

  async remove(orgId: string, id: string) {
    const source = await this.find(orgId, id);
    await this.prisma.source.delete({ where: { id: source.id } });
    if (source.storageKey) await this.storage.delete(source.storageKey);
    return { removed: true };
  }
}
