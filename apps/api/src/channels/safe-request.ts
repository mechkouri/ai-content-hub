import {
  assertSafeUrl,
  defaultResolver,
  defaultTransport,
  FetchFailedError,
  Resolver,
  Transport,
  UnsafeUrlError,
} from '../sources/safe-fetch';

export { FetchFailedError, UnsafeUrlError };

export interface HttpResponse {
  status: number;
  /** Parsed JSON body, or null when the body was empty or not JSON. */
  json: any;
}

export interface HttpOptions {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: unknown;
}

/** Sends one request to a website. Tests replace this; production uses {@link safeJsonRequest}. */
export type HttpClient = (url: string, opts?: HttpOptions) => Promise<HttpResponse>;
export const HTTP_CLIENT = Symbol('HTTP_CLIENT');

const MAX_BYTES = 2 * 1024 * 1024;

/**
 * JSON request to a user-supplied website, with the same SSRF protection as source imports:
 * public addresses only, the IP pinned after the check, standard ports, strict time and size limits.
 * Redirects are never followed: the request carries a login, and it must not travel to another host.
 */
export function makeSafeJsonRequest(
  deps: { resolver?: Resolver; transport?: Transport; timeoutMs?: number } = {},
): HttpClient {
  const resolver = deps.resolver ?? defaultResolver;
  const transport = deps.transport ?? defaultTransport;
  const timeoutMs = deps.timeoutMs ?? 20_000;

  return async (url, opts = {}) => {
    const target = await assertSafeUrl(url, resolver);
    const hasBody = opts.body !== undefined;
    const res = await transport({
      ...target,
      timeoutMs,
      method: opts.method ?? 'GET',
      body: hasBody ? JSON.stringify(opts.body) : undefined,
      headers: {
        'User-Agent': 'AIContentHub/1.0 (publishing)',
        Accept: 'application/json',
        ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
        ...opts.headers,
      },
    });

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      await res.body?.cancel().catch(() => undefined);
      throw new FetchFailedError(
        'The website redirected the request. Use its final address (for example with https and without a redirect).',
      );
    }
    const text = await readLimited(res);
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { status: res.status, json };
  };
}

async function readLimited(res: Response): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new FetchFailedError('The website sent too much data');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}
