import { Injectable } from '@nestjs/common';
import { loadEnv } from '../config/env';
import { ModelInfo, ProviderError, TextProvider, TextRequest, TextResult } from './ai.types';
import { classifyHttpError, fetchWithTimeout, readText } from './ai.util';

const CATALOG_TTL_MS = 10 * 60 * 1000;
/** OpenRouter's router that only selects free models. Used as "automatic": we pick the best model ourselves. */
export const FREE_ROUTER = 'openrouter/free';
const AUTO_CANDIDATES = 4;
const MAX_TOKENS_CAP = 16_000;
/** A model that just failed (rate-limited upstream, empty answer...) sits out for a while. */
const COOLDOWN_MS = 2 * 60 * 1000;
/** Speed assumed for a model we have not measured yet. */
const UNKNOWN_SPEED_MS = 25_000;

interface RawModel {
  id: string;
  name?: string;
  context_length?: number;
  pricing?: { prompt?: string | number; completion?: string | number };
  supported_parameters?: string[];
  architecture?: { output_modalities?: string[] };
  reasoning?: { mandatory?: boolean; default_enabled?: boolean };
}

/**
 * Whether a model "thinks" before answering. Reasoning tokens count against max_tokens, so a model that
 * reasons can spend its whole budget thinking and return an empty or cut-off answer.
 *  - 'off':     does not reason, or reasoning is optional (we switch it off)
 *  - 'unknown': reasoning is not clearly optional or mandatory
 *  - 'on':      reasoning is mandatory and cannot be disabled
 */
export function reasoningMode(m: RawModel): 'off' | 'unknown' | 'on' {
  const params = m.supported_parameters ?? [];
  const supports = params.includes('reasoning') || params.includes('include_reasoning');
  if (!supports && !m.reasoning) return 'off';
  const r = m.reasoning;
  if (!r) return 'unknown';
  if (r.mandatory) return 'on';
  if (r.mandatory === false) return 'off';
  return r.default_enabled === false ? 'off' : 'unknown';
}

const RANK = { off: 0, unknown: 1, on: 2 } as const;

@Injectable()
export class OpenRouterProvider implements TextProvider {
  readonly id = 'openrouter';
  private catalog: { at: number; models: ModelInfo[] } | null = null;
  /** model id -> time until which it is skipped */
  private readonly cooldown = new Map<string, number>();
  /** model id -> how long its last successful answer took */
  private readonly speed = new Map<string, number>();
  /** models that rejected "reasoning disabled" although the catalog said it was optional */
  private readonly forcedReasoning = new Set<string>();

  isConfigured() {
    return Boolean(loadEnv().OPENROUTER_API_KEY);
  }

  /** The model list is public and changes often, so free models are discovered at runtime. */
  async listFreeModels(): Promise<ModelInfo[]> {
    if (this.catalog && Date.now() - this.catalog.at < CATALOG_TTL_MS) return this.catalog.models;
    const env = loadEnv();
    const res = await fetchWithTimeout(`${env.OPENROUTER_BASE_URL}/models`, {}, env.AI_TIMEOUT_MS);
    if (!res.ok) throw classifyHttpError(res.status, '', res.headers.get('retry-after'));
    const body = (await res.json()) as { data?: RawModel[] };
    const models: ModelInfo[] = (body.data ?? [])
      .filter((m) => Number(m.pricing?.prompt) === 0 && Number(m.pricing?.completion) === 0)
      // Text writers only: the free list also contains audio/music generators that return no usable text.
      .filter((m) => {
        const out = m.architecture?.output_modalities;
        return !out || (out.length === 1 && out[0] === 'text');
      })
      .map((m) => ({
        id: m.id,
        name: m.name ?? m.id,
        contextLength: m.context_length ?? 0,
        supportsJson: (m.supported_parameters ?? []).includes('response_format'),
        reasoning: reasoningMode(m),
        reasoningOptional: m.reasoning?.mandatory === false,
      }));
    if (!models.some((m) => m.id === FREE_ROUTER)) {
      models.unshift({
        id: FREE_ROUTER,
        name: 'Automatic (best free model)',
        contextLength: 0,
        supportsJson: false,
        reasoning: 'unknown',
      });
    }
    this.catalog = { at: Date.now(), models };
    return models;
  }

  async assertFree(model: string): Promise<void> {
    if (model === FREE_ROUTER) return;
    let free: ModelInfo[] | null = null;
    try {
      free = await this.listFreeModels();
    } catch {
      // Catalog unreachable: only the ":free" naming convention is accepted. Never guess a paid model is free.
      if (model.endsWith(':free')) return;
      throw new ProviderError('not_free', 'Could not verify that this model is free');
    }
    if (!free.some((m) => m.id === model)) {
      throw new ProviderError('not_free', `Model "${model}" is not on the current free model list`);
    }
  }

  /**
   * Automatic mode. Models that answer directly come first (models that must reason are skipped, since they are
   * slow and often run out of tokens), recently failed models sit out, models that were fast before go first, and
   * OpenRouter's own free router is the last resort.
   */
  async pickAutoModels(needsJson: boolean): Promise<string[]> {
    let free: ModelInfo[] = [];
    try {
      free = await this.listFreeModels();
    } catch {
      return [FREE_ROUTER];
    }
    const now = Date.now();
    const eligible = free.filter(
      (m) => m.id !== FREE_ROUTER && m.reasoning !== 'on' && (!needsJson || m.supportsJson),
    );
    const resting = (m: ModelInfo) => (this.cooldown.get(m.id) ?? 0) > now;
    const speedOf = (m: ModelInfo) => this.speed.get(m.id) ?? UNKNOWN_SPEED_MS;
    const order = (a: ModelInfo, b: ModelInfo) =>
      RANK[a.reasoning ?? 'unknown'] - RANK[b.reasoning ?? 'unknown'] ||
      speedOf(a) - speedOf(b) ||
      b.contextLength - a.contextLength ||
      a.id.localeCompare(b.id);
    const ready = eligible.filter((m) => !resting(m)).sort(order);
    // If everything is resting, try them anyway (best first) rather than failing outright.
    const pool = ready.length ? ready : eligible.sort(order);
    return [...pool.slice(0, AUTO_CANDIDATES).map((m) => m.id), FREE_ROUTER];
  }

  async generate(req: TextRequest): Promise<TextResult> {
    const env = loadEnv();
    if (!env.OPENROUTER_API_KEY)
      throw new ProviderError('not_configured', 'OpenRouter is not configured');

    const auto = req.model === FREE_ROUTER;
    if (!auto) await this.assertFree(req.model);
    const candidates = auto ? await this.pickAutoModels(Boolean(req.json)) : [req.model];

    // Free models vary a lot in speed. Each attempt gets the normal timeout, but all attempts together
    // share one budget so slow fallbacks cannot add up to minutes.
    const startedAt = Date.now();
    const budgetMs = env.AI_TIMEOUT_MS * 2;
    let lastError: unknown;
    for (const model of candidates) {
      const remaining = budgetMs - (Date.now() - startedAt);
      if (lastError && remaining < 3000) break;
      const attemptStart = Date.now();
      try {
        const result = await this.callModel(
          model,
          req,
          Math.min(env.AI_TIMEOUT_MS, Math.max(remaining, 3000)),
        );
        this.speed.set(model, Date.now() - attemptStart);
        this.cooldown.delete(model);
        return result;
      } catch (e) {
        lastError = e;
        // Another model can help with empty/cut-off answers and outages, but not with credentials or quota.
        const recoverable =
          e instanceof ProviderError &&
          (e.kind === 'unavailable' || e.kind === 'timeout' || e.kind === 'rate_limit');
        if (!recoverable) throw e;
        if (model !== FREE_ROUTER) this.cooldown.set(model, Date.now() + COOLDOWN_MS);
      }
    }
    throw lastError;
  }

  private async callModel(
    model: string,
    req: TextRequest,
    timeoutMs: number,
    withoutReasoningFlag = false,
  ): Promise<TextResult> {
    const env = loadEnv();
    const info = (this.catalog?.models ?? []).find((m) => m.id === model);
    const disableReasoning =
      Boolean(info?.reasoningOptional) && !this.forcedReasoning.has(model) && !withoutReasoningFlag;
    // Models that think (and cannot be switched off) need room to think AND answer, as reasoning counts against max_tokens.
    const thinks = !disableReasoning && (info?.reasoning === 'on' || info?.reasoning === 'unknown');
    const maxTokens = req.maxTokens
      ? Math.min(thinks ? req.maxTokens * 3 : req.maxTokens, MAX_TOKENS_CAP)
      : undefined;

    const messages = [
      ...(req.system ? [{ role: 'system', content: req.system }] : []),
      { role: 'user', content: req.prompt },
    ];
    const res = await fetchWithTimeout(
      `${env.OPENROUTER_BASE_URL}/chat/completions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'X-Title': 'AI Content Hub',
        },
        body: JSON.stringify({
          model,
          messages,
          ...(maxTokens ? { max_tokens: maxTokens } : {}),
          ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
          ...(req.json ? { response_format: { type: 'json_object' } } : {}),
          ...(disableReasoning ? { reasoning: { enabled: false } } : {}),
        }),
      },
      timeoutMs,
    );

    // The timeout also covers reading the body, which can stall after the headers arrive.
    const raw = await readText(res);
    let body: any = null;
    try {
      body = JSON.parse(raw);
    } catch {
      /* non-JSON error page */
    }
    if (!res.ok) {
      const message = body?.error?.message ?? raw;
      // The catalog said reasoning is optional, but this model insists: remember it and retry once.
      if (
        res.status === 400 &&
        disableReasoning &&
        /reasoning is mandatory|cannot be disabled/i.test(String(message))
      ) {
        this.forcedReasoning.add(model);
        return this.callModel(model, req, timeoutMs, true);
      }
      throw classifyHttpError(res.status, message, res.headers.get('retry-after'));
    }
    // OpenRouter can answer 200 with an error object (e.g. upstream failure).
    if (body?.error) {
      throw classifyHttpError(Number(body.error.code) || 502, String(body.error.message ?? ''));
    }
    const choice = body?.choices?.[0];
    const text = choice?.message?.content;
    if (typeof text !== 'string' || !text.trim()) {
      throw new ProviderError('unavailable', 'The AI provider returned an empty response', true);
    }
    // A structured answer that stopped because it ran out of tokens is cut off mid-way and unusable.
    if (req.json && choice?.finish_reason === 'length') {
      throw new ProviderError('unavailable', 'The AI answer was cut off before it finished', true);
    }
    return {
      text,
      model: body.model ?? model,
      promptTokens: body.usage?.prompt_tokens ?? 0,
      completionTokens: body.usage?.completion_tokens ?? 0,
    };
  }
}
