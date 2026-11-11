import { Injectable } from '@nestjs/common';
import { loadEnv } from '../config/env';
import { ModelInfo, ProviderError, TextProvider, TextRequest, TextResult } from './ai.types';
import { classifyHttpError, fetchWithTimeout } from './ai.util';

const CATALOG_TTL_MS = 10 * 60 * 1000;
/** OpenRouter's router that only selects free models. */
export const FREE_ROUTER = 'openrouter/free';

interface RawModel {
  id: string;
  name?: string;
  context_length?: number;
  pricing?: { prompt?: string | number; completion?: string | number };
  supported_parameters?: string[];
}

@Injectable()
export class OpenRouterProvider implements TextProvider {
  readonly id = 'openrouter';
  private catalog: { at: number; models: ModelInfo[] } | null = null;

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
    const models = (body.data ?? [])
      .filter((m) => Number(m.pricing?.prompt) === 0 && Number(m.pricing?.completion) === 0)
      .map((m) => ({
        id: m.id,
        name: m.name ?? m.id,
        contextLength: m.context_length ?? 0,
        supportsJson: (m.supported_parameters ?? []).includes('response_format'),
      }));
    if (!models.some((m) => m.id === FREE_ROUTER)) {
      models.unshift({
        id: FREE_ROUTER,
        name: 'Free models router',
        contextLength: 0,
        supportsJson: false,
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

  async generate(req: TextRequest): Promise<TextResult> {
    const env = loadEnv();
    if (!env.OPENROUTER_API_KEY)
      throw new ProviderError('not_configured', 'OpenRouter is not configured');
    await this.assertFree(req.model);

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
          model: req.model,
          messages,
          ...(req.maxTokens ? { max_tokens: req.maxTokens } : {}),
          ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
          ...(req.json ? { response_format: { type: 'json_object' } } : {}),
        }),
      },
      env.AI_TIMEOUT_MS,
    );

    const raw = await res.text();
    let body: any = null;
    try {
      body = JSON.parse(raw);
    } catch {
      /* non-JSON error page */
    }
    if (!res.ok) {
      throw classifyHttpError(
        res.status,
        body?.error?.message ?? raw,
        res.headers.get('retry-after'),
      );
    }
    // OpenRouter can answer 200 with an error object (e.g. upstream failure).
    if (body?.error) {
      throw classifyHttpError(Number(body.error.code) || 502, String(body.error.message ?? ''));
    }
    const text = body?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) {
      throw new ProviderError('unavailable', 'The AI provider returned an empty response', true);
    }
    return {
      text,
      model: body.model ?? req.model,
      promptTokens: body.usage?.prompt_tokens ?? 0,
      completionTokens: body.usage?.completion_tokens ?? 0,
    };
  }
}
