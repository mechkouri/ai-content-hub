import { promises as dns } from 'dns';
import { BlockList, isIP } from 'net';
import { Agent, fetch as undiciFetch } from 'undici';

/** Thrown when a URL (or a redirect hop) points somewhere we must never connect to. */
export class UnsafeUrlError extends Error {}
/** Thrown for ordinary import failures (timeout, too large, wrong type, site refuses bots...). */
export class FetchFailedError extends Error {}

const blocked = new BlockList();
const v4: [string, number][] = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16], // incl. cloud metadata
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];
const v6: [string, number][] = [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['100::', 64],
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
];
v4.forEach(([net, prefix]) => blocked.addSubnet(net, prefix, 'ipv4'));
v6.forEach(([net, prefix]) => blocked.addSubnet(net, prefix, 'ipv6'));

/** True when an IP must not be contacted. Invalid input is treated as blocked. */
export function isBlockedAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 0) return true;
  return blocked.check(ip, family === 4 ? 'ipv4' : 'ipv6');
}

const BLOCKED_SUFFIXES = [
  '.localhost',
  '.local',
  '.internal',
  '.localdomain',
  '.lan',
  '.home',
  '.corp',
];
const MAX_REDIRECTS = 5;
const ALLOWED_TYPES = ['text/html', 'text/plain', 'application/xhtml+xml'];
const USER_AGENT = 'AIContentHubBot/1.0 (content import; respects robots.txt)';

export type Resolver = (hostname: string) => Promise<string[]>;
export const defaultResolver: Resolver = async (host) =>
  (await dns.lookup(host, { all: true })).map((a) => a.address);

export interface SafeTarget {
  url: URL;
  address: string;
  family: 4 | 6;
}

/** Validates a URL and resolves it to an address that is safe to connect to. Runs on every redirect hop. */
export async function assertSafeUrl(
  input: string,
  resolver: Resolver = defaultResolver,
): Promise<SafeTarget> {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new UnsafeUrlError('Invalid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new UnsafeUrlError('Only http and https URLs are allowed');
  if (url.username || url.password)
    throw new UnsafeUrlError('URLs with credentials are not allowed');
  if (url.port && url.port !== '80' && url.port !== '443')
    throw new UnsafeUrlError('Only standard web ports are allowed');

  const host = url.hostname
    .replace(/^\[|\]$/g, '')
    .toLowerCase()
    .replace(/\.$/, '');
  if (!host) throw new UnsafeUrlError('Invalid URL');

  let addresses: string[];
  if (isIP(host)) {
    addresses = [host];
  } else {
    if (
      host === 'localhost' ||
      BLOCKED_SUFFIXES.some((s) => host.endsWith(s)) ||
      !host.includes('.')
    ) {
      throw new UnsafeUrlError('This address is not allowed');
    }
    try {
      addresses = await resolver(host);
    } catch {
      throw new FetchFailedError('Could not resolve the website address');
    }
    if (!addresses.length) throw new FetchFailedError('Could not resolve the website address');
  }
  // Every resolved address must be public: a mixed answer is a rebinding warning sign.
  if (addresses.some(isBlockedAddress)) throw new UnsafeUrlError('This address is not allowed');
  return { url, address: addresses[0], family: isIP(addresses[0]) === 6 ? 6 : 4 };
}

export interface TransportRequest extends SafeTarget {
  timeoutMs: number;
  headers: Record<string, string>;
  method?: string;
  body?: string | Uint8Array;
}
export type Transport = (req: TransportRequest) => Promise<Response>;

/** Connects to the already-validated IP (pinned), so DNS cannot change between the check and the connection. */
export const defaultTransport: Transport = async (req) => {
  const agent = new Agent({
    connect: {
      lookup: (_host: string, opts: any, cb: any) => {
        const entry = { address: req.address, family: req.family };
        if (opts?.all) cb(null, [entry]);
        else cb(null, entry.address, entry.family);
      },
    },
    headersTimeout: req.timeoutMs,
    bodyTimeout: req.timeoutMs,
  });
  try {
    const res = await undiciFetch(req.url.toString(), {
      dispatcher: agent,
      redirect: 'manual',
      method: req.method ?? 'GET',
      body: req.body,
      headers: req.headers,
      signal: AbortSignal.timeout(req.timeoutMs),
    });
    return res as unknown as Response;
  } catch (e) {
    await agent.close().catch(() => undefined);
    const name = (e as Error).name;
    if (name === 'TimeoutError' || name === 'AbortError')
      throw new FetchFailedError('The website took too long to respond');
    throw new FetchFailedError('Could not connect to the website');
  }
};

async function readCapped(
  res: Response,
  maxBytes: number,
  tooLarge = 'The page is too large to import',
): Promise<Uint8Array> {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new FetchFailedError(tooLarge);
  if (!res.body) return new Uint8Array();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new FetchFailedError(tooLarge);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export interface SafeFetchOptions {
  resolver?: Resolver;
  transport?: Transport;
  timeoutMs?: number;
  maxBytes?: number;
  allowedTypes?: string[] | null;
}
export interface FetchedPage {
  finalUrl: string;
  contentType: string;
  body: string;
}

function decode(bytes: Uint8Array, contentType: string): string {
  const charset = /charset=([^;]+)/i.exec(contentType)?.[1]?.trim().replace(/["']/g, '') ?? 'utf-8';
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

export interface FetchedBytes {
  finalUrl: string;
  contentType: string;
  bytes: Uint8Array;
}

/**
 * The shared download: SSRF protection (public addresses only, the IP pinned after the check), every redirect
 * validated again, and strict size and time limits. `accept` is only a hint to the server; the caller still checks.
 */
async function safeFetchRaw(
  input: string,
  opts: SafeFetchOptions & {
    accept: string;
    tooLarge: string;
    wrongType: string;
    blocked?: string;
  },
): Promise<FetchedBytes> {
  const resolver = opts.resolver ?? defaultResolver;
  const transport = opts.transport ?? defaultTransport;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const maxBytes = opts.maxBytes ?? 2 * 1024 * 1024;
  const allowed = opts.allowedTypes === undefined ? ALLOWED_TYPES : opts.allowedTypes;

  let current = input;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const target = await assertSafeUrl(current, resolver);
    const res = await transport({
      ...target,
      timeoutMs,
      headers: { 'User-Agent': USER_AGENT, Accept: opts.accept },
    });

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      await res.body?.cancel().catch(() => undefined);
      const location = res.headers.get('location');
      if (!location) throw new FetchFailedError('The website sent an invalid redirect');
      current = new URL(location, target.url).toString(); // re-validated at the top of the loop
      continue;
    }
    if ([401, 403, 429, 503].includes(res.status)) {
      await res.body?.cancel().catch(() => undefined);
      throw new FetchFailedError(
        opts.blocked ?? 'This website does not allow automated access. Paste the text instead.',
      );
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      throw new FetchFailedError(`The website returned an error (${res.status})`);
    }
    const contentType = res.headers.get('content-type') ?? '';
    if (allowed && !allowed.some((t) => contentType.toLowerCase().startsWith(t))) {
      await res.body?.cancel().catch(() => undefined);
      throw new FetchFailedError(opts.wrongType);
    }
    const bytes = await readCapped(res, maxBytes, opts.tooLarge);
    return { finalUrl: target.url.toString(), contentType, bytes };
  }
  throw new FetchFailedError('The website redirected too many times');
}

/** Fetches text content from a public website with SSRF protection, validated redirects, size and time limits. */
export async function safeFetchText(
  input: string,
  opts: SafeFetchOptions = {},
): Promise<FetchedPage> {
  const r = await safeFetchRaw(input, {
    ...opts,
    accept: 'text/html,text/plain;q=0.9,*/*;q=0.1',
    tooLarge: 'The page is too large to import',
    wrongType: 'Only web pages and plain text can be imported from a URL',
  });
  return { finalUrl: r.finalUrl, contentType: r.contentType, body: decode(r.bytes, r.contentType) };
}

/**
 * Downloads a picture from a public website with the same protections. The caller must still check that the
 * bytes really are an image: the server's content type is only a first filter.
 */
export async function safeFetchImage(
  input: string,
  opts: SafeFetchOptions = {},
): Promise<FetchedBytes> {
  return safeFetchRaw(input, {
    ...opts,
    allowedTypes: opts.allowedTypes ?? ['image/'],
    maxBytes: opts.maxBytes ?? 12 * 1024 * 1024,
    accept: 'image/jpeg,image/png,image/webp,image/gif;q=0.9,*/*;q=0.1',
    tooLarge: 'The picture is too large to import',
    wrongType: 'That address is not a picture',
    blocked: 'That site does not allow importing this picture. Try another one.',
  });
}

// ---- robots.txt (good-citizen check; we never try to bypass access controls) ----

export function parseRobots(
  text: string,
  agentName = 'aicontenthubbot',
): { allow: boolean; path: string }[] {
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = [];
  let current: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split('#')[0].trim();
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (field === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((field === 'disallow' || field === 'allow') && current) {
      lastWasAgent = false;
      if (value) current.rules.push({ allow: field === 'allow', path: value });
    } else {
      lastWasAgent = false;
    }
  }
  const specific = groups.filter((g) => g.agents.some((a) => a !== '*' && agentName.includes(a)));
  const chosen = specific.length ? specific : groups.filter((g) => g.agents.includes('*'));
  return chosen.flatMap((g) => g.rules);
}

export function isPathAllowed(rules: { allow: boolean; path: string }[], path: string): boolean {
  const matches = rules.filter((r) => {
    const pattern = r.path.replace(/\$$/, '');
    return r.path.endsWith('$') ? path === pattern : path.startsWith(pattern);
  });
  if (!matches.length) return true;
  // Longest (most specific) rule wins; Allow wins a tie.
  matches.sort((a, b) => b.path.length - a.path.length || Number(b.allow) - Number(a.allow));
  return matches[0].allow;
}

export async function isAllowedByRobots(
  pageUrl: string,
  opts: SafeFetchOptions = {},
): Promise<boolean> {
  try {
    const u = new URL(pageUrl);
    const robots = await safeFetchText(`${u.origin}/robots.txt`, {
      ...opts,
      maxBytes: 200 * 1024,
      allowedTypes: null,
      timeoutMs: 5000,
    });
    return isPathAllowed(parseRobots(robots.body), u.pathname + u.search);
  } catch (e) {
    if (e instanceof UnsafeUrlError) throw e;
    return true; // no robots.txt (or unreachable): proceed
  }
}
