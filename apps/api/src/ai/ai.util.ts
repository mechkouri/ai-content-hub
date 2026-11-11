import { ProviderError } from './ai.types';

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    const name = (e as Error).name;
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new ProviderError('timeout', 'The AI provider took too long to respond', true);
    }
    throw new ProviderError('unavailable', 'Could not reach the AI provider', true);
  }
}

/**
 * The request's timeout signal also covers reading the response body. A stalled download then throws a raw
 * TimeoutError, so body reads go through these helpers to turn it into a typed, retryable provider error.
 */
async function guardedRead<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (e) {
    const name = (e as Error)?.name;
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new ProviderError('timeout', 'The AI provider took too long to respond', true);
    }
    throw new ProviderError('unavailable', 'The AI provider response was interrupted', true);
  }
}
export const readText = (res: Response) => guardedRead(() => res.text());
export const readBytes = (res: Response) =>
  guardedRead(async () => Buffer.from(await res.arrayBuffer()));
/** Parses JSON, returning null for an invalid body (a stalled download still throws a typed error). */
export const readJson = async (res: Response): Promise<any> => {
  const text = await readText(res);
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const QUOTA_HINT = /per.?day|daily|quota|credits?|allocation|exhaust|limit.*(reached|exceeded)/i;

/** Maps an HTTP failure to a typed provider error. Quota-like 429s are NOT retried. */
export function classifyHttpError(
  status: number,
  message: string,
  retryAfterHeader?: string | null,
): ProviderError {
  const retryAfter = retryAfterHeader ? Number(retryAfterHeader) : undefined;
  const ra = Number.isFinite(retryAfter) ? retryAfter : undefined;
  if (status === 401 || status === 403)
    return new ProviderError('auth', 'AI provider rejected the credentials');
  if (status === 402)
    return new ProviderError('quota', 'The AI provider free allowance is used up');
  if (status === 429) {
    return QUOTA_HINT.test(message)
      ? new ProviderError('quota', 'The AI provider free allowance is used up', false, ra)
      : new ProviderError('rate_limit', 'The AI provider is rate limiting requests', true, ra);
  }
  if (status === 408 || status === 504)
    return new ProviderError('timeout', 'The AI provider timed out', true);
  if (status === 400 || status === 422)
    return new ProviderError(
      'invalid',
      `The AI provider rejected the request: ${message.slice(0, 200)}`,
    );
  if (status === 404)
    return new ProviderError('unavailable', 'The requested model is not available');
  if (status >= 500)
    return new ProviderError('unavailable', 'The AI provider is temporarily unavailable', true);
  return new ProviderError('unavailable', `Unexpected AI provider response (${status})`);
}

export interface RetryOptions {
  attempts: number;
  baseMs: number;
  maxWaitMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let lastError: unknown;
  for (let attempt = 0; attempt < opts.attempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (!(e instanceof ProviderError) || !e.retryable || attempt === opts.attempts - 1) throw e;
      const backoff = opts.baseMs * 2 ** attempt;
      const wait = e.retryAfterSeconds ? e.retryAfterSeconds * 1000 : backoff;
      await sleep(Math.min(wait, opts.maxWaitMs ?? 10_000));
    }
  }
  throw lastError;
}

/** Extracts a JSON object from model output, tolerating code fences and surrounding prose. */
export function extractJson(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error('No JSON object found');
  }
}
