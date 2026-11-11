import { HttpException, INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AiKind, AiStatus, Role } from '@prisma/client';
import request from 'supertest';
import { z } from 'zod';
import { AppModule } from '../app.module';
import { TOKEN_VERIFIER } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { AiLimitsService } from './ai-limits.service';
import { AiService } from './ai.service';
import { ImageProvider, ProviderError, TextProvider } from './ai.types';
import { extractJson, withRetry } from './ai.util';
import { CloudflareImageProvider } from './cloudflare-image.provider';
import { OpenRouterProvider } from './openrouter.provider';

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40)]);
const ORG_A = '11111111-1111-4111-8111-111111111111';
const U_ADMIN = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const U_EDITOR = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const U_VIEWER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

const ENV_KEYS = [
  'OPENROUTER_API_KEY',
  'OPENROUTER_DEFAULT_MODEL',
  'CLOUDFLARE_IMAGE_WORKER_URL',
  'CLOUDFLARE_IMAGE_WORKER_TOKEN',
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_API_TOKEN',
  'AI_DAILY_TEXT_LIMIT',
  'AI_RATE_PER_MINUTE',
];
const savedEnv: Record<string, string | undefined> = {};
const realFetch = global.fetch;
let fetchMock: jest.Mock;

beforeEach(() => {
  ENV_KEYS.forEach((k) => {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  });
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  ENV_KEYS.forEach((k) =>
    savedEnv[k] === undefined ? delete process.env[k] : (process.env[k] = savedEnv[k]),
  );
  global.fetch = realFetch;
});

const MODELS = {
  data: [
    {
      id: 'meta/free-one:free',
      name: 'Free One',
      context_length: 8000,
      pricing: { prompt: '0', completion: '0' },
      supported_parameters: ['response_format'],
    },
    {
      id: 'vendor/paid-model',
      name: 'Paid',
      context_length: 8000,
      pricing: { prompt: '0.000001', completion: '0.000002' },
    },
  ],
};
const completion = (text: string) =>
  json(200, {
    model: 'meta/free-one:free',
    choices: [{ message: { content: text } }],
    usage: { prompt_tokens: 5, completion_tokens: 7 },
  });

describe('OpenRouterProvider', () => {
  it('lists only free models (plus the free router)', async () => {
    fetchMock.mockResolvedValueOnce(json(200, MODELS));
    const ids = (await new OpenRouterProvider().listFreeModels()).map((m) => m.id);
    expect(ids).toEqual(['openrouter/free', 'meta/free-one:free']);
  });

  it('refuses paid models and never calls the completion endpoint', async () => {
    process.env.OPENROUTER_API_KEY = 'k';
    fetchMock.mockResolvedValue(json(200, MODELS));
    await expect(
      new OpenRouterProvider().generate({ model: 'vendor/paid-model', prompt: 'hi' }),
    ).rejects.toMatchObject({ kind: 'not_free' });
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('chat/completions'))).toBe(
      false,
    );
  });

  it('fails closed when the catalog is unreachable and the model is not named :free', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    const p = new OpenRouterProvider();
    await expect(p.assertFree('vendor/paid-model')).rejects.toMatchObject({ kind: 'not_free' });
    await expect(p.assertFree('some/model:free')).resolves.toBeUndefined();
  });

  it('generates text, sends JSON mode and the server-side key, and reports usage', async () => {
    process.env.OPENROUTER_API_KEY = 'secret-key';
    fetchMock.mockImplementation(async (url: string) =>
      String(url).endsWith('/models') ? json(200, MODELS) : completion('{"a":1}'),
    );
    const res = await new OpenRouterProvider().generate({
      model: 'meta/free-one:free',
      prompt: 'p',
      system: 's',
      json: true,
    });
    expect(res).toMatchObject({ text: '{"a":1}', promptTokens: 5, completionTokens: 7 });
    const [, init] = fetchMock.mock.calls.find(([u]) => String(u).includes('chat/completions'))!;
    expect(init.headers.Authorization).toBe('Bearer secret-key');
    const body = JSON.parse(init.body);
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.messages[0]).toEqual({ role: 'system', content: 's' });
  });

  it('classifies failures: daily free quota vs plain rate limit vs auth vs 200-with-error', async () => {
    process.env.OPENROUTER_API_KEY = 'k';
    const p = new OpenRouterProvider();
    // The model list is served normally; each chat call takes the next queued reply.
    const chat: Response[] = [];
    fetchMock.mockImplementation(async (url: string) =>
      String(url).endsWith('/models') ? json(200, MODELS) : chat.shift()!,
    );
    const call = () => p.generate({ model: 'meta/free-one:free', prompt: 'x' });
    chat.push(json(429, { error: { message: 'Rate limit exceeded: free-models-per-day' } }));
    await expect(call()).rejects.toMatchObject({ kind: 'quota', retryable: false });
    chat.push(json(429, { error: { message: 'slow down' } }, { 'retry-after': '3' }));
    await expect(call()).rejects.toMatchObject({
      kind: 'rate_limit',
      retryable: true,
      retryAfterSeconds: 3,
    });
    chat.push(json(401, { error: { message: 'bad key' } }));
    await expect(call()).rejects.toMatchObject({ kind: 'auth', retryable: false });
    chat.push(json(200, { error: { code: 502, message: 'upstream down' } }));
    await expect(call()).rejects.toMatchObject({ kind: 'unavailable', retryable: true });
    chat.push(json(200, { choices: [{ message: { content: '  ' } }] }));
    await expect(call()).rejects.toMatchObject({ kind: 'unavailable' });
  });

  it('reports not_configured without a key', async () => {
    const p = new OpenRouterProvider();
    expect(p.isConfigured()).toBe(false);
    await expect(p.generate({ model: 'openrouter/free', prompt: 'x' })).rejects.toMatchObject({
      kind: 'not_configured',
    });
  });
});

describe('OpenRouterProvider automatic model selection', () => {
  const free = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    name: id,
    context_length: 100_000,
    pricing: { prompt: '0', completion: '0' },
    supported_parameters: ['response_format', 'reasoning', 'include_reasoning', 'max_tokens'],
    architecture: { output_modalities: ['text'] },
    ...extra,
  });
  const CATALOG = {
    data: [
      free('forced/thinker:free', { reasoning: { mandatory: true, default_enabled: true } }),
      free('google/quiet-small:free', {
        context_length: 50_000,
        reasoning: { mandatory: false, default_enabled: false },
      }),
      free('google/quiet-big:free', {
        context_length: 250_000,
        reasoning: { mandatory: false, default_enabled: false },
      }),
      free('maybe/unknown:free', { reasoning: {} }),
      free('plain/no-reasoning:free', {
        supported_parameters: ['response_format', 'max_tokens'],
        context_length: 10_000,
      }),
      free('no/json:free', {
        supported_parameters: ['reasoning', 'max_tokens'],
        reasoning: { mandatory: false, default_enabled: false },
      }),
      free('google/lyria-music:free', { architecture: { output_modalities: ['text', 'audio'] } }),
      {
        id: 'vendor/paid',
        name: 'paid',
        pricing: { prompt: '0.1', completion: '0.1' },
        architecture: { output_modalities: ['text'] },
      },
    ],
  };
  const ok = (text: string, extra: object = {}) =>
    json(200, {
      model: 'x',
      choices: [{ message: { content: text }, finish_reason: 'stop', ...extra }],
      usage: { prompt_tokens: 1, completion_tokens: 2 },
    });

  it('ranks non-reasoning free models first, drops forced reasoners, music models and paid models', async () => {
    fetchMock.mockResolvedValue(json(200, CATALOG));
    const p = new OpenRouterProvider();
    expect(await p.pickAutoModels(true)).toEqual([
      'google/quiet-big:free', // reasoning optional/off, biggest context
      'google/quiet-small:free',
      'plain/no-reasoning:free', // no reasoning support at all
      'maybe/unknown:free', // unclear reasoning behaviour ranks after the clear ones
      'openrouter/free', // last resort
    ]);
    const all = (await p.listFreeModels()).map((m) => m.id);
    expect(all).not.toContain('google/lyria-music:free'); // audio generator is not a text writer
    expect(all).not.toContain('vendor/paid');
  });

  it('only requires JSON support when JSON is requested', async () => {
    fetchMock.mockResolvedValue(json(200, CATALOG));
    const p = new OpenRouterProvider();
    expect((await p.pickAutoModels(true)).includes('no/json:free')).toBe(false);
    expect((await p.pickAutoModels(false)).includes('no/json:free')).toBe(true);
  });

  it('falls back to the openrouter free router when the catalog is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    expect(await new OpenRouterProvider().pickAutoModels(true)).toEqual(['openrouter/free']);
  });

  it('uses the best candidate and moves to the next one when an answer is empty or cut off', async () => {
    process.env.OPENROUTER_API_KEY = 'k';
    const used: string[] = [];
    const replies = [
      ok('', {}), // 1st candidate: empty answer (spent its tokens thinking)
      ok('{"partial": tru', { finish_reason: 'length' }), // 2nd: cut off
      ok('{"done": true}'), // 3rd: finished
    ];
    fetchMock.mockImplementation(async (url: string, init: any) => {
      if (String(url).endsWith('/models')) return json(200, CATALOG);
      used.push(JSON.parse(init.body).model);
      return replies.shift()!;
    });
    const res = await new OpenRouterProvider().generate({
      model: 'openrouter/free',
      prompt: 'x',
      json: true,
      maxTokens: 1000,
    });
    expect(res.text).toBe('{"done": true}');
    expect(used).toEqual([
      'google/quiet-big:free',
      'google/quiet-small:free',
      'plain/no-reasoning:free',
    ]);
  });

  it('does not switch models for credential or quota problems', async () => {
    process.env.OPENROUTER_API_KEY = 'k';
    const used: string[] = [];
    fetchMock.mockImplementation(async (url: string, init: any) => {
      if (String(url).endsWith('/models')) return json(200, CATALOG);
      used.push(JSON.parse(init.body).model);
      return json(429, { error: { message: 'free-models-per-day exhausted' } });
    });
    await expect(
      new OpenRouterProvider().generate({ model: 'openrouter/free', prompt: 'x' }),
    ).rejects.toMatchObject({ kind: 'quota' });
    expect(used).toHaveLength(1);
  });

  it('gives reasoning models extra token room, but not models that answer directly', async () => {
    process.env.OPENROUTER_API_KEY = 'k';
    const sent: Record<string, number> = {};
    fetchMock.mockImplementation(async (url: string, init: any) => {
      if (String(url).endsWith('/models')) return json(200, CATALOG);
      const b = JSON.parse(init.body);
      sent[b.model] = b.max_tokens;
      return ok('fine');
    });
    const p = new OpenRouterProvider();
    await p.generate({ model: 'google/quiet-big:free', prompt: 'x', maxTokens: 2000 });
    expect(sent['google/quiet-big:free']).toBe(2000);
    await p.generate({ model: 'forced/thinker:free', prompt: 'x', maxTokens: 2000 });
    expect(sent['forced/thinker:free']).toBe(6000); // 3x
    await p.generate({ model: 'forced/thinker:free', prompt: 'x', maxTokens: 9000 });
    expect(sent['forced/thinker:free']).toBe(16_000); // capped
  });

  it('switches reasoning off only for models where it is optional', async () => {
    process.env.OPENROUTER_API_KEY = 'k';
    const sent: Record<string, any> = {};
    fetchMock.mockImplementation(async (url: string, init: any) => {
      if (String(url).endsWith('/models')) return json(200, CATALOG);
      const b = JSON.parse(init.body);
      sent[b.model] = b;
      return ok('fine');
    });
    const p = new OpenRouterProvider();
    await p.generate({ model: 'google/quiet-big:free', prompt: 'x', maxTokens: 1000 });
    await p.generate({ model: 'forced/thinker:free', prompt: 'x', maxTokens: 1000 });
    await p.generate({ model: 'maybe/unknown:free', prompt: 'x', maxTokens: 1000 });
    expect(sent['google/quiet-big:free'].reasoning).toEqual({ enabled: false });
    expect(sent['google/quiet-big:free'].max_tokens).toBe(1000); // no thinking, no extra room needed
    expect(sent['forced/thinker:free'].reasoning).toBeUndefined(); // mandatory: would be rejected
    expect(sent['forced/thinker:free'].max_tokens).toBe(3000);
    expect(sent['maybe/unknown:free'].reasoning).toBeUndefined();
  });

  it('remembers a model that refuses to stop reasoning and retries it without the flag', async () => {
    process.env.OPENROUTER_API_KEY = 'k';
    const bodies: any[] = [];
    fetchMock.mockImplementation(async (url: string, init: any) => {
      if (String(url).endsWith('/models')) return json(200, CATALOG);
      const b = JSON.parse(init.body);
      bodies.push(b);
      return b.reasoning
        ? json(400, {
            error: { message: 'Reasoning is mandatory for this endpoint and cannot be disabled.' },
          })
        : ok('finally');
    });
    const p = new OpenRouterProvider();
    await expect(
      p.generate({ model: 'google/quiet-big:free', prompt: 'x', maxTokens: 1000 }),
    ).resolves.toMatchObject({ text: 'finally' });
    expect(bodies.map((b) => Boolean(b.reasoning))).toEqual([true, false]);
    await p.generate({ model: 'google/quiet-big:free', prompt: 'x', maxTokens: 1000 });
    expect(bodies.map((b) => Boolean(b.reasoning))).toEqual([true, false, false]); // remembered, not re-sent
  });

  it('lets a model that just failed rest, and tries models that were fast before first', async () => {
    process.env.OPENROUTER_API_KEY = 'k';
    let now = 5_000_000;
    const clock = jest.spyOn(Date, 'now').mockImplementation(() => now);
    const used: string[] = [];
    const behavior: Record<string, 'rate_limited' | 'fast' | 'slow'> = {
      'google/quiet-big:free': 'rate_limited',
      'google/quiet-small:free': 'slow',
      'plain/no-reasoning:free': 'fast',
    };
    fetchMock.mockImplementation(async (url: string, init: any) => {
      if (String(url).endsWith('/models')) return json(200, CATALOG);
      const model = JSON.parse(init.body).model;
      used.push(model);
      const kind = behavior[model] ?? 'slow';
      if (kind === 'rate_limited')
        return json(429, { error: { message: 'Provider returned error' } });
      now += kind === 'fast' ? 2_000 : 20_000;
      return ok('{"ok":true}');
    });
    try {
      const p = new OpenRouterProvider();
      // 1st call: biggest model is rate limited, the next one answers (slowly).
      await p.generate({ model: 'openrouter/free', prompt: 'x', json: true });
      expect(used).toEqual(['google/quiet-big:free', 'google/quiet-small:free']);
      // Make the "fast" model known by using it directly.
      await p.generate({ model: 'plain/no-reasoning:free', prompt: 'x', json: true });
      used.length = 0;
      // 2nd automatic call: the rate-limited model rests, the measured-fast model goes first.
      await p.generate({ model: 'openrouter/free', prompt: 'x', json: true });
      expect(used[0]).toBe('plain/no-reasoning:free');
      expect(used).not.toContain('google/quiet-big:free');
      // After the rest period it is eligible again.
      now += 3 * 60 * 1000;
      expect((await p.pickAutoModels(true)).includes('google/quiet-big:free')).toBe(true);
    } finally {
      clock.mockRestore();
    }
  });

  it('turns a stalled response body into a typed, retryable timeout', async () => {
    process.env.OPENROUTER_API_KEY = 'k';
    const stalled = {
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => {
        throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
      },
    };
    fetchMock.mockImplementation(async (url: string) =>
      String(url).endsWith('/models') ? json(200, CATALOG) : (stalled as unknown as Response),
    );
    await expect(
      new OpenRouterProvider().generate({ model: 'google/quiet-big:free', prompt: 'x' }),
    ).rejects.toMatchObject({ kind: 'timeout', retryable: true });
  });

  it('stops trying more models once the shared time budget is used up', async () => {
    process.env.OPENROUTER_API_KEY = 'k';
    process.env.AI_TIMEOUT_MS = '60000';
    let now = 1_000_000;
    const clock = jest.spyOn(Date, 'now').mockImplementation(() => now);
    const used: string[] = [];
    try {
      fetchMock.mockImplementation(async (url: string, init: any) => {
        if (String(url).endsWith('/models')) return json(200, CATALOG);
        used.push(JSON.parse(init.body).model);
        now += 70_000; // every attempt is slow and ends without an answer
        return ok('');
      });
      await expect(
        new OpenRouterProvider().generate({ model: 'openrouter/free', prompt: 'x', json: true }),
      ).rejects.toMatchObject({ kind: 'unavailable' });
      // Budget is 2 x 60s: after two 70s attempts there is no time left for the 3rd and 4th candidates.
      expect(used).toHaveLength(2);
    } finally {
      clock.mockRestore();
      delete process.env.AI_TIMEOUT_MS;
    }
  });

  it('accepts a cut-off answer for plain text but not for structured JSON', async () => {
    process.env.OPENROUTER_API_KEY = 'k';
    fetchMock.mockImplementation(async (url: string) =>
      String(url).endsWith('/models')
        ? json(200, CATALOG)
        : ok('half a sent', { finish_reason: 'length' }),
    );
    const p = new OpenRouterProvider();
    await expect(
      p.generate({ model: 'google/quiet-big:free', prompt: 'x' }),
    ).resolves.toMatchObject({ text: 'half a sent' });
    await expect(
      p.generate({ model: 'google/quiet-big:free', prompt: 'x', json: true }),
    ).rejects.toMatchObject({ kind: 'unavailable' });
  });
});

describe('CloudflareImageProvider', () => {
  it('uses the Worker when configured and verifies the bytes are an image', async () => {
    process.env.CLOUDFLARE_IMAGE_WORKER_URL = 'https://img.example.workers.dev/';
    process.env.CLOUDFLARE_IMAGE_WORKER_TOKEN = 'tok';
    fetchMock.mockResolvedValueOnce(
      new Response(JPEG, { status: 200, headers: { 'content-type': 'image/jpeg' } }),
    );
    const res = await new CloudflareImageProvider().generate({ prompt: 'a cat', steps: 4 });
    expect(res.mimeType).toBe('image/jpeg');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://img.example.workers.dev/generate');
    expect(JSON.parse(init.body)).toEqual({ prompt: 'a cat', steps: 4 });
    expect(init.headers.Authorization).toBe('Bearer tok');
  });

  it('uses the REST API with base64 output', async () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = 'acc123';
    process.env.CLOUDFLARE_API_TOKEN = 'cf';
    fetchMock.mockResolvedValueOnce(
      json(200, { success: true, result: { image: JPEG.toString('base64') } }),
    );
    const res = await new CloudflareImageProvider().generate({ prompt: 'x', steps: 2 });
    expect(res.data.equals(JPEG)).toBe(true);
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      '/accounts/acc123/ai/run/@cf/black-forest-labs/flux-1-schnell',
    );
  });

  it('rejects non-image payloads and maps quota errors', async () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = 'a';
    process.env.CLOUDFLARE_API_TOKEN = 'b';
    const p = new CloudflareImageProvider();
    fetchMock.mockResolvedValueOnce(
      json(200, { success: true, result: { image: Buffer.from('<html>nope').toString('base64') } }),
    );
    await expect(p.generate({ prompt: 'x', steps: 4 })).rejects.toMatchObject({
      kind: 'unavailable',
    });
    fetchMock.mockResolvedValueOnce(
      json(429, {
        errors: [{ code: 4006, message: 'you have used up your daily free allocation' }],
      }),
    );
    await expect(p.generate({ prompt: 'x', steps: 4 })).rejects.toMatchObject({ kind: 'quota' });
  });

  it('turns a stalled image download into a typed, retryable timeout', async () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = 'a';
    process.env.CLOUDFLARE_API_TOKEN = 'b';
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'image/jpeg' }),
      arrayBuffer: async () => {
        throw new DOMException('timeout', 'TimeoutError');
      },
    } as unknown as Response);
    await expect(
      new CloudflareImageProvider().generate({ prompt: 'x', steps: 4 }),
    ).rejects.toMatchObject({ kind: 'timeout', retryable: true });
  });

  it('is not configured by default', async () => {
    const p = new CloudflareImageProvider();
    expect(p.isConfigured()).toBe(false);
    await expect(p.generate({ prompt: 'x', steps: 4 })).rejects.toMatchObject({
      kind: 'not_configured',
    });
  });
});

describe('retry & json helpers', () => {
  it('retries retryable errors with backoff, then succeeds', async () => {
    const waits: number[] = [];
    let n = 0;
    const res = await withRetry(
      async () => {
        if (++n < 3) throw new ProviderError('rate_limit', 'slow', true);
        return 'ok';
      },
      { attempts: 3, baseMs: 100, sleep: async (ms) => void waits.push(ms) },
    );
    expect(res).toBe('ok');
    expect(waits).toEqual([100, 200]);
  });
  it('does not retry non-retryable errors and gives up after max attempts', async () => {
    const fn = jest.fn().mockRejectedValue(new ProviderError('auth', 'no'));
    await expect(
      withRetry(fn, { attempts: 3, baseMs: 1, sleep: async () => {} }),
    ).rejects.toMatchObject({ kind: 'auth' });
    expect(fn).toHaveBeenCalledTimes(1);
    const fn2 = jest.fn().mockRejectedValue(new ProviderError('timeout', 't', true));
    await expect(
      withRetry(fn2, { attempts: 3, baseMs: 1, sleep: async () => {} }),
    ).rejects.toMatchObject({ kind: 'timeout' });
    expect(fn2).toHaveBeenCalledTimes(3);
  });
  it('extracts JSON from fenced or chatty output', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Sure! Here you go: {"a":{"b":2}} hope it helps')).toEqual({ a: { b: 2 } });
    expect(() => extractJson('no json here')).toThrow();
  });
});

// ---- Service-level behaviour with fake providers and an in-memory usage table ----
let usage: any[];
let settings: any;
const prismaMock: any = {
  user: { upsert: jest.fn().mockResolvedValue({}) },
  membership: { findUnique: jest.fn() },
  aiUsage: {
    count: jest.fn(
      async ({ where }: any) =>
        usage.filter(
          (u) =>
            u.organizationId === where.organizationId &&
            u.kind === where.kind &&
            u.status === where.status &&
            u.createdAt >= where.createdAt.gte,
        ).length,
    ),
    create: jest.fn(async ({ data }: any) => {
      usage.push({ ...data, createdAt: new Date() });
      return data;
    }),
  },
  aiSetting: {
    findUnique: jest.fn(async () => settings),
    upsert: jest.fn(
      async ({ create, update }: any) => (settings = { ...(settings ?? {}), ...create, ...update }),
    ),
  },
};

const fakeText = (id: string, impl: (req: any) => Promise<any>): TextProvider => ({
  id,
  isConfigured: () => true,
  assertFree: async (m) => {
    if (m.startsWith('paid')) throw new ProviderError('not_free', 'not free');
  },
  listFreeModels: async () => [
    { id: 'openrouter/free', name: 'Free', contextLength: 0, supportsJson: true },
  ],
  generate: jest.fn(impl),
});
const okText =
  (text = 'hello') =>
  async (req: any) => ({ text, model: req.model, promptTokens: 1, completionTokens: 2 });
const make = (texts: TextProvider[], images: ImageProvider[] = []) => {
  const limits = new AiLimitsService(prismaMock);
  const svc = new AiService(texts, images, limits);
  svc.sleep = async () => {};
  return svc;
};
const ctx = { orgId: ORG_A, userId: U_ADMIN };
const statusOf = (e: unknown) => (e as HttpException).getStatus();
const bodyOf = (e: unknown) => (e as HttpException).getResponse() as any;

describe('AiService', () => {
  beforeEach(() => {
    usage = [];
    settings = null;
    process.env.AI_RATE_PER_MINUTE = '1000';
  });

  it('records successful usage and uses the free router by default', async () => {
    const p = fakeText('a', okText());
    const res = await make([p]).generateText(ctx, { prompt: 'hi' });
    expect(res.text).toBe('hello');
    expect((p.generate as jest.Mock).mock.calls[0][0].model).toBe('openrouter/free');
    expect(usage).toHaveLength(1);
    expect(usage[0]).toMatchObject({
      status: AiStatus.SUCCESS,
      kind: AiKind.TEXT,
      promptTokens: 1,
      completionTokens: 2,
    });
  });

  it('enforces the organization daily quota with a clear 429 (and does not call the provider)', async () => {
    process.env.AI_DAILY_TEXT_LIMIT = '2';
    const p = fakeText('a', okText());
    const svc = make([p]);
    await svc.generateText(ctx, { prompt: '1' });
    await svc.generateText(ctx, { prompt: '2' });
    const err = await svc.generateText(ctx, { prompt: '3' }).catch((e) => e);
    expect(statusOf(err)).toBe(429);
    expect(bodyOf(err)).toMatchObject({
      code: 'QUOTA_EXHAUSTED',
      period: 'daily',
      limit: 2,
      used: 2,
    });
    expect(p.generate).toHaveBeenCalledTimes(2);
  });

  it('lets organizations lower, but never raise, the platform cap', async () => {
    process.env.AI_DAILY_TEXT_LIMIT = '5';
    settings = { dailyTextLimit: 1 };
    expect((await new AiLimitsService(prismaMock).effectiveLimits(ORG_A)).dailyText).toBe(1);
    settings = { dailyTextLimit: 999 };
    expect((await new AiLimitsService(prismaMock).effectiveLimits(ORG_A)).dailyText).toBe(5);
  });

  it('rate limits per organization', async () => {
    process.env.AI_RATE_PER_MINUTE = '2';
    const svc = make([fakeText('a', okText())]);
    await svc.generateText(ctx, { prompt: '1' });
    await svc.generateText(ctx, { prompt: '2' });
    const err = await svc.generateText(ctx, { prompt: '3' }).catch((e) => e);
    expect(bodyOf(err)).toMatchObject({ code: 'RATE_LIMITED' });
    // another organization is unaffected
    await expect(
      svc.generateText({ ...ctx, orgId: '22222222-2222-4222-8222-222222222222' }, { prompt: 'x' }),
    ).resolves.toBeDefined();
  });

  it('retries transient provider errors, and logs failures without counting them toward quota', async () => {
    process.env.AI_RETRY_ATTEMPTS = '3';
    try {
      let n = 0;
      const p = fakeText('a', async (req) => {
        if (++n < 3) throw new ProviderError('unavailable', 'blip', true);
        return okText()(req);
      });
      await make([p]).generateText(ctx, { prompt: 'x' });
      expect(p.generate).toHaveBeenCalledTimes(3);
      expect(usage.filter((u) => u.status === AiStatus.SUCCESS)).toHaveLength(1);
    } finally {
      delete process.env.AI_RETRY_ATTEMPTS;
    }
  });

  it('defaults to two attempts per provider so slow free models cannot stack up', async () => {
    const p = fakeText('a', async () => {
      throw new ProviderError('unavailable', 'blip', true);
    });
    await expect(make([p]).generateText(ctx, { prompt: 'x' })).rejects.toBeDefined();
    expect(p.generate).toHaveBeenCalledTimes(2);
  });

  it('on provider quota exhaustion tries the next free provider, but not on other errors', async () => {
    const exhausted = fakeText('one', async () => {
      throw new ProviderError('quota', 'used up');
    });
    const backup = fakeText('two', okText('from backup'));
    const res = await make([exhausted, backup]).generateText(ctx, { prompt: 'x' });
    expect(res).toMatchObject({ text: 'from backup', provider: 'two' });
    expect(usage.map((u) => [u.provider, u.status])).toEqual([
      ['one', 'FAILED'],
      ['two', 'SUCCESS'],
    ]);

    const broken = fakeText('one', async () => {
      throw new ProviderError('auth', 'bad key');
    });
    const never = fakeText('two', okText());
    const err = await make([broken, never])
      .generateText(ctx, { prompt: 'x' })
      .catch((e) => e);
    expect(bodyOf(err)).toMatchObject({ code: 'PROVIDER_AUTH_FAILED', retryable: false });
    expect(never.generate).not.toHaveBeenCalled();
  });

  it('tells the user clearly when the only provider has no free quota left', async () => {
    const p = fakeText('a', async () => {
      throw new ProviderError('quota', 'used up');
    });
    const err = await make([p])
      .generateText(ctx, { prompt: 'x' })
      .catch((e) => e);
    expect(statusOf(err)).toBe(503);
    expect(bodyOf(err)).toMatchObject({ code: 'PROVIDER_QUOTA_EXHAUSTED', retryable: true });
  });

  it('reports a missing provider configuration and timeouts distinctly', async () => {
    const off = { ...fakeText('a', okText()), isConfigured: () => false };
    expect(
      bodyOf(
        await make([off])
          .generateText(ctx, { prompt: 'x' })
          .catch((e) => e),
      ),
    ).toMatchObject({ code: 'PROVIDER_NOT_CONFIGURED' });
    const slow = fakeText('a', async () => {
      throw new ProviderError('timeout', 'slow', true);
    });
    expect(
      statusOf(
        await make([slow])
          .generateText(ctx, { prompt: 'x' })
          .catch((e) => e),
      ),
    ).toBe(504);
  });

  it('caches opted-in responses without spending quota', async () => {
    const p = fakeText('a', okText());
    const svc = make([p]);
    await svc.generateText(ctx, { prompt: 'same', cacheTtlSeconds: 60 });
    const again = await svc.generateText(ctx, { prompt: 'same', cacheTtlSeconds: 60 });
    expect(again.cached).toBe(true);
    expect(p.generate).toHaveBeenCalledTimes(1);
    expect(usage).toHaveLength(1);
  });

  it('validates structured JSON with Zod and repairs a bad first reply once', async () => {
    const replies = ['not json at all', '```json\n{"title":"Hello","tags":["a"]}\n```'];
    const p = fakeText('a', async (req) => okText(replies.shift()!)(req));
    const out = await make([p]).generateJson(ctx, {
      prompt: 'x',
      schema: z.object({ title: z.string(), tags: z.array(z.string()) }),
    });
    expect(out.data).toEqual({ title: 'Hello', tags: ['a'] });
    expect((p.generate as jest.Mock).mock.calls[1][0].prompt).toContain(
      'previous reply was invalid',
    );

    const bad = fakeText('a', okText('{"title":1}'));
    const err = await make([bad])
      .generateJson(ctx, { prompt: 'x', schema: z.object({ title: z.string() }) })
      .catch((e) => e);
    expect(bodyOf(err)).toMatchObject({ code: 'INVALID_AI_OUTPUT' });
  });

  it('validates image prompts and counts image usage separately', async () => {
    const img: ImageProvider = {
      id: 'cf',
      isConfigured: () => true,
      generate: jest.fn(async () => ({ data: JPEG, mimeType: 'image/jpeg', model: 'flux' })),
    };
    const svc = make([], [img]);
    await expect(svc.generateImage(ctx, { prompt: '' })).rejects.toMatchObject({ status: 400 });
    await expect(svc.generateImage(ctx, { prompt: 'x', steps: 9 })).rejects.toMatchObject({
      status: 400,
    });
    await svc.generateImage(ctx, { prompt: 'a fine photo' });
    expect(usage[0]).toMatchObject({ kind: AiKind.IMAGE, status: AiStatus.SUCCESS });
  });
});

// ---- HTTP: permissions and the free-model rule at the API boundary ----
describe('AI endpoints', () => {
  let app: INestApplication;
  let memberships: { userId: string; organizationId: string; role: Role }[];
  const textProvider = fakeText('or', okText('generated'));

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(TOKEN_VERIFIER)
      .useValue({
        verify: async (t: string) => {
          if (!t.startsWith('user:')) throw new UnauthorizedException();
          return { id: t.split(':')[1], email: 'x@x.test' };
        },
      })
      .overrideProvider(OpenRouterProvider)
      .useValue(textProvider)
      .compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });
  afterAll(() => app.close());

  beforeEach(() => {
    usage = [];
    settings = null;
    process.env.AI_RATE_PER_MINUTE = '1000';
    memberships = [
      { userId: U_ADMIN, organizationId: ORG_A, role: Role.ADMIN },
      { userId: U_EDITOR, organizationId: ORG_A, role: Role.EDITOR },
      { userId: U_VIEWER, organizationId: ORG_A, role: Role.VIEWER },
    ];
    prismaMock.membership.findUnique.mockImplementation(async ({ where }: any) => {
      const k = where.userId_organizationId;
      const m = memberships.find(
        (x) => x.userId === k.userId && x.organizationId === k.organizationId,
      );
      return m ? { id: 'm', ...m } : null;
    });
  });

  const url = (p: string) => `/api/organizations/${ORG_A}/ai/${p}`;
  const as = (id: string) => `Bearer user:${id}`;

  it('status is visible to editors, hidden from viewers, never exposes keys', async () => {
    process.env.OPENROUTER_API_KEY = 'super-secret';
    await request(app.getHttpServer())
      .get(url('status'))
      .set('Authorization', as(U_VIEWER))
      .expect(403);
    const res = await request(app.getHttpServer())
      .get(url('status'))
      .set('Authorization', as(U_EDITOR))
      .expect(200);
    expect(res.body).toMatchObject({ freeOnly: true, textModel: 'openrouter/free' });
    expect(res.body.limits).toBeDefined();
    expect(JSON.stringify(res.body)).not.toContain('super-secret');
  });

  it('only admins can run provider tests or change settings', async () => {
    await request(app.getHttpServer())
      .post(url('test-text'))
      .set('Authorization', as(U_EDITOR))
      .send({ prompt: 'hi' })
      .expect(403);
    await request(app.getHttpServer())
      .put(url('settings'))
      .set('Authorization', as(U_EDITOR))
      .send({})
      .expect(403);
    const res = await request(app.getHttpServer())
      .post(url('test-text'))
      .set('Authorization', as(U_ADMIN))
      .send({ prompt: 'hi' })
      .expect(201);
    expect(res.body).toMatchObject({ text: 'generated', provider: 'or' });
  });

  it('rejects non-free models in settings and stores free ones and lower limits', async () => {
    const put = (body: object) =>
      request(app.getHttpServer())
        .put(url('settings'))
        .set('Authorization', as(U_ADMIN))
        .send(body);
    const bad = await put({ textModel: 'paid-model' }).expect(400);
    expect(bad.body.code).toBe('MODEL_NOT_FREE');
    await put({ dailyTextLimit: -1 }).expect(400);
    await put({ textModel: 'openrouter/free', dailyTextLimit: 5 }).expect(200);
    expect(settings).toMatchObject({ textModel: 'openrouter/free', dailyTextLimit: 5 });
  });

  it('requires authentication', async () => {
    await request(app.getHttpServer()).get(url('status')).expect(401);
  });
});
