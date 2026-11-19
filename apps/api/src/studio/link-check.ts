import {
  assertSafeUrl,
  defaultResolver,
  defaultTransport,
  FetchFailedError,
  Resolver,
  Transport,
  UnsafeUrlError,
} from '../sources/safe-fetch';

export type LinkStatus =
  /** Answers normally. */
  | 'ok'
  /** Answers, but only after moving somewhere else: the link should point at the final address. */
  | 'redirect'
  /** The page is gone or the address does not work (404, 410, no such site). */
  | 'broken'
  /** The site is up but refuses automated checks (or is busy), so nothing can be said for sure. */
  | 'unverified'
  /** Not a public web address, so it is never contacted. */
  | 'unsafe';

export interface LinkResult {
  url: string;
  status: LinkStatus;
  httpStatus?: number;
  /** For a redirect: where it ends up. */
  finalUrl?: string;
}

export interface LinkCheckDeps {
  resolver?: Resolver;
  transport?: Transport;
  timeoutMs?: number;
}

const MAX_HOPS = 5;
const USER_AGENT = 'AIContentHubBot/1.0 (link check; respects robots.txt)';

/** The distinct web links an article's text contains, in order: [text](https://…) links and bare addresses. */
export function linksIn(texts: string[], max = 15): string[] {
  const found: string[] = [];
  const add = (u: string) => {
    const clean = u.replace(/[.,;:!?]+$/, '');
    if (!found.includes(clean)) found.push(clean);
  };
  for (const text of texts) {
    // pictures are not links
    const withoutPictures = text.replace(/!\[[^\]\n]*\]\([^)\n]*\)/g, ' ');
    for (const m of withoutPictures.matchAll(/\]\((https?:\/\/[^\s)]+)\)/g)) add(m[1]);
    const noMarkdownLinks = withoutPictures.replace(/\[[^\]\n]*\]\(https?:\/\/[^\s)]+\)/g, ' ');
    for (const m of noMarkdownLinks.matchAll(/https?:\/\/[^\s)>"'\]]+/g)) add(m[0]);
  }
  return found.slice(0, max);
}

/**
 * Checks one link without ever contacting a private or internal address. HEAD first (cheap), then GET when a site
 * does not support HEAD. Redirects are followed one hop at a time, each hop validated again.
 */
export async function checkLink(url: string, deps: LinkCheckDeps = {}): Promise<LinkResult> {
  const resolver = deps.resolver ?? defaultResolver;
  const transport = deps.transport ?? defaultTransport;
  const timeoutMs = deps.timeoutMs ?? 8000;
  let current = url;
  let method: 'HEAD' | 'GET' = 'HEAD';
  let hops = 0;
  for (let step = 0; step < MAX_HOPS * 2 + 2; step++) {
    let target;
    try {
      target = await assertSafeUrl(current, resolver);
    } catch (e) {
      if (e instanceof UnsafeUrlError) return { url, status: 'unsafe' };
      // the address does not exist (no such site)
      return { url, status: 'broken' };
    }
    let res: Response;
    try {
      res = await transport({
        ...target,
        timeoutMs,
        method,
        headers: { 'User-Agent': USER_AGENT, Accept: '*/*' },
      });
    } catch (e) {
      if (e instanceof FetchFailedError && /too long/i.test(e.message))
        return { url, status: 'unverified' };
      return { url, status: 'broken' };
    }
    await res.body?.cancel().catch(() => undefined);
    const code = res.status;

    if ([301, 302, 303, 307, 308].includes(code)) {
      const location = res.headers.get('location');
      if (!location || ++hops > MAX_HOPS) return { url, status: 'broken', httpStatus: code };
      current = new URL(location, target.url).toString();
      continue;
    }
    if (method === 'HEAD' && (code === 405 || code === 501 || code === 400)) {
      method = 'GET'; // some sites do not answer HEAD
      continue;
    }
    if (code >= 200 && code < 300) {
      const moved = current !== url && normalize(current) !== normalize(url);
      return moved
        ? { url, status: 'redirect', httpStatus: code, finalUrl: current }
        : { url, status: 'ok', httpStatus: code };
    }
    if (code === 401 || code === 403 || code === 429 || code === 503 || code === 999) {
      return { url, status: 'unverified', httpStatus: code };
    }
    if (code === 404 || code === 410 || code >= 400)
      return { url, status: 'broken', httpStatus: code };
    return { url, status: 'unverified', httpStatus: code };
  }
  return { url, status: 'broken' };
}

/** A web address compared loosely: "https://a.example/x/" and "https://A.example/x" are the same page. */
const normalize = (u: string) => u.replace(/#.*$/, '').replace(/\/+$/, '').toLowerCase();

/** Checks several links at once, a few at a time so a long list cannot flood a site (or this server). */
export async function checkLinks(
  urls: string[],
  deps: LinkCheckDeps = {},
  concurrency = 4,
): Promise<LinkResult[]> {
  const results: LinkResult[] = new Array(urls.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= urls.length) return;
      results[i] = await checkLink(urls[i], deps);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, worker));
  return results;
}
