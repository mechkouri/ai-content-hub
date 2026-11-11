import { BadRequestException, HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { AiKind, AiStatus } from '@prisma/client';
import { createHash } from 'crypto';
import { ZodType, ZodTypeDef } from 'zod';
import { loadEnv } from '../config/env';
import { AiLimitsService } from './ai-limits.service';
import {
  IMAGE_PROVIDERS,
  ImageProvider,
  ImageResult,
  ProviderError,
  TEXT_PROVIDERS,
  TextProvider,
  TextResult,
} from './ai.types';
import { extractJson, withRetry } from './ai.util';

export interface AiContext {
  orgId: string;
  userId: string;
}
export interface TextOptions {
  system?: string;
  prompt: string;
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
  /** Override the organization's model (must still be free). */
  model?: string;
  /** Opt-in response cache; hits do not count against quotas. */
  cacheTtlSeconds?: number;
}

const MAX_PROMPT_CHARS = 30_000;
const CACHE_MAX = 200;

@Injectable()
export class AiService {
  private readonly cache = new Map<string, { value: TextResult; expires: number }>();
  /** Tests can replace this to avoid real waiting during retries. */
  sleep?: (ms: number) => Promise<void>;

  constructor(
    @Inject(TEXT_PROVIDERS) private readonly texts: TextProvider[],
    @Inject(IMAGE_PROVIDERS) private readonly images: ImageProvider[],
    private readonly limits: AiLimitsService,
  ) {}

  providerStatus() {
    return {
      text: this.texts.map((p) => ({ id: p.id, configured: p.isConfigured() })),
      image: this.images.map((p) => ({ id: p.id, configured: p.isConfigured() })),
    };
  }

  async effectiveTextModel(orgId: string) {
    const s = await this.limits.getSettings(orgId);
    return s?.textModel ?? loadEnv().OPENROUTER_DEFAULT_MODEL;
  }

  async listFreeTextModels() {
    const provider = this.texts.find((p) => p.isConfigured()) ?? this.texts[0];
    return provider ? provider.listFreeModels() : [];
  }

  async assertFreeTextModel(model: string) {
    const provider = this.texts[0];
    if (!provider) throw this.toHttp(new ProviderError('not_configured', 'No text provider'));
    try {
      await provider.assertFree(model);
    } catch (e) {
      throw this.toHttp(e);
    }
  }

  async generateText(
    ctx: AiContext,
    opts: TextOptions,
  ): Promise<TextResult & { cached: boolean; provider: string }> {
    if (!opts.prompt?.trim()) throw new BadRequestException('A prompt is required');
    if (opts.prompt.length + (opts.system?.length ?? 0) > MAX_PROMPT_CHARS) {
      throw new BadRequestException('Prompt is too long');
    }
    const model = opts.model ?? (await this.effectiveTextModel(ctx.orgId));

    const key = opts.cacheTtlSeconds
      ? createHash('sha256')
          .update(JSON.stringify([ctx.orgId, model, opts.system, opts.prompt, !!opts.json]))
          .digest('hex')
      : null;
    if (key) {
      const hit = this.cache.get(key);
      if (hit && hit.expires > Date.now()) return { ...hit.value, cached: true, provider: 'cache' };
    }

    await this.limits.assertAllowed(ctx.orgId, AiKind.TEXT);
    const configured = this.texts.filter((p) => p.isConfigured());
    if (!configured.length)
      throw this.toHttp(new ProviderError('not_configured', 'No text provider is configured'));

    const env = loadEnv();
    let lastError: unknown;
    for (const provider of configured) {
      const started = Date.now();
      try {
        const result = await withRetry(() => provider.generate({ ...opts, model }), {
          attempts: env.AI_RETRY_ATTEMPTS,
          baseMs: 500,
          sleep: this.sleep,
        });
        await this.limits.record({
          orgId: ctx.orgId,
          userId: ctx.userId,
          provider: provider.id,
          model: result.model,
          kind: AiKind.TEXT,
          status: AiStatus.SUCCESS,
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
          latencyMs: Date.now() - started,
        });
        if (key) this.remember(key, result, opts.cacheTtlSeconds!);
        return { ...result, cached: false, provider: provider.id };
      } catch (e) {
        lastError = e;
        await this.limits.record({
          orgId: ctx.orgId,
          userId: ctx.userId,
          provider: provider.id,
          model,
          kind: AiKind.TEXT,
          status: AiStatus.FAILED,
          errorKind: e instanceof ProviderError ? e.kind : 'unknown',
          latencyMs: Date.now() - started,
        });
        // Only a quota failure moves on to another configured free provider; never to a paid one.
        if (!(e instanceof ProviderError && e.kind === 'quota')) break;
      }
    }
    throw this.toHttp(lastError);
  }

  /** Generates JSON validated by a Zod schema, with one repair attempt if the model returns bad JSON. */
  async generateJson<T>(
    ctx: AiContext,
    opts: Omit<TextOptions, 'json'> & { schema: ZodType<T, ZodTypeDef, unknown> },
  ): Promise<{ data: T; model: string; provider: string }> {
    const { schema, ...rest } = opts;
    let prompt = rest.prompt;
    let lastProblem = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await this.generateText(ctx, { ...rest, prompt, json: true });
      try {
        const parsed = schema.safeParse(extractJson(res.text));
        if (parsed.success) return { data: parsed.data, model: res.model, provider: res.provider };
        lastProblem = parsed.error.issues
          .slice(0, 5)
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ');
      } catch {
        lastProblem = 'The reply was not valid JSON';
      }
      prompt = `${rest.prompt}\n\nYour previous reply was invalid (${lastProblem}). Reply again with ONLY a valid JSON object matching the requested structure.`;
    }
    throw new HttpException(
      {
        code: 'INVALID_AI_OUTPUT',
        message: 'The AI model did not return valid structured output. Please try again.',
      },
      HttpStatus.BAD_GATEWAY,
    );
  }

  async generateImage(
    ctx: AiContext,
    opts: { prompt: string; steps?: number },
  ): Promise<ImageResult & { provider: string }> {
    const prompt = opts.prompt?.trim();
    if (!prompt || prompt.length > 2048)
      throw new BadRequestException('Prompt must be 1 to 2048 characters');
    const steps = opts.steps ?? 4;
    if (!Number.isInteger(steps) || steps < 1 || steps > 8)
      throw new BadRequestException('Steps must be 1 to 8');

    await this.limits.assertAllowed(ctx.orgId, AiKind.IMAGE);
    const configured = this.images.filter((p) => p.isConfigured());
    if (!configured.length)
      throw this.toHttp(new ProviderError('not_configured', 'No image provider is configured'));

    const env = loadEnv();
    let lastError: unknown;
    for (const provider of configured) {
      const started = Date.now();
      try {
        const result = await withRetry(() => provider.generate({ prompt, steps }), {
          attempts: env.AI_RETRY_ATTEMPTS,
          baseMs: 500,
          sleep: this.sleep,
        });
        await this.limits.record({
          orgId: ctx.orgId,
          userId: ctx.userId,
          provider: provider.id,
          model: result.model,
          kind: AiKind.IMAGE,
          status: AiStatus.SUCCESS,
          latencyMs: Date.now() - started,
        });
        return { ...result, provider: provider.id };
      } catch (e) {
        lastError = e;
        await this.limits.record({
          orgId: ctx.orgId,
          userId: ctx.userId,
          provider: provider.id,
          model: 'image',
          kind: AiKind.IMAGE,
          status: AiStatus.FAILED,
          errorKind: e instanceof ProviderError ? e.kind : 'unknown',
          latencyMs: Date.now() - started,
        });
        if (!(e instanceof ProviderError && e.kind === 'quota')) break;
      }
    }
    throw this.toHttp(lastError);
  }

  private remember(key: string, value: TextResult, ttlSeconds: number) {
    if (this.cache.size >= CACHE_MAX) this.cache.delete(this.cache.keys().next().value as string);
    this.cache.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
  }

  /** Converts provider failures to clear API errors. The caller still holds the request, so it can retry or switch provider later. */
  toHttp(e: unknown): HttpException {
    if (e instanceof HttpException) return e;
    if (!(e instanceof ProviderError)) {
      return new HttpException(
        { code: 'AI_ERROR', message: 'AI generation failed unexpectedly.' },
        HttpStatus.BAD_GATEWAY,
      );
    }
    const map: Record<string, [HttpStatus, string]> = {
      quota: [HttpStatus.SERVICE_UNAVAILABLE, 'PROVIDER_QUOTA_EXHAUSTED'],
      rate_limit: [HttpStatus.SERVICE_UNAVAILABLE, 'PROVIDER_RATE_LIMITED'],
      timeout: [HttpStatus.GATEWAY_TIMEOUT, 'PROVIDER_TIMEOUT'],
      auth: [HttpStatus.SERVICE_UNAVAILABLE, 'PROVIDER_AUTH_FAILED'],
      invalid: [HttpStatus.BAD_GATEWAY, 'PROVIDER_REJECTED_REQUEST'],
      unavailable: [HttpStatus.SERVICE_UNAVAILABLE, 'PROVIDER_UNAVAILABLE'],
      not_configured: [HttpStatus.SERVICE_UNAVAILABLE, 'PROVIDER_NOT_CONFIGURED'],
      not_free: [HttpStatus.BAD_REQUEST, 'MODEL_NOT_FREE'],
    };
    const [status, code] = map[e.kind];
    return new HttpException(
      {
        code,
        message: e.message,
        ...(e.retryAfterSeconds ? { retryAfterSeconds: e.retryAfterSeconds } : {}),
        retryable:
          e.kind !== 'auth' &&
          e.kind !== 'not_configured' &&
          e.kind !== 'not_free' &&
          e.kind !== 'invalid',
      },
      status,
    );
  }
}
