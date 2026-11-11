import {
  FetchFailedError,
  Transport,
  UnsafeUrlError,
  assertSafeUrl,
  isAllowedByRobots,
  isBlockedAddress,
  isPathAllowed,
  parseRobots,
  safeFetchText,
} from './safe-fetch';

const PUBLIC = '93.184.216.34';
const publicResolver = async () => [PUBLIC];
const html = (body: string, headers: Record<string, string> = {}) =>
  new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', ...headers },
  });
const redirect = (to: string, status = 302) =>
  new Response(null, { status, headers: { location: to } });

describe('isBlockedAddress', () => {
  it.each([
    '127.0.0.1',
    '127.255.255.254',
    '10.0.0.1',
    '10.255.255.255',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.0.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '255.255.255.255',
    '198.18.0.1',
    '::1',
    '::',
    'fe80::1',
    'fc00::1',
    'fd12:3456::1',
    '::ffff:127.0.0.1',
    '::ffff:10.0.0.5',
    '2001:db8::1',
    'ff02::1',
    'not-an-ip',
    '',
  ])('blocks %s', (ip) => expect(isBlockedAddress(ip)).toBe(true));

  it.each([
    '8.8.8.8',
    '93.184.216.34',
    '172.32.0.1',
    '172.15.255.255',
    '100.63.255.255',
    '2606:4700:4700::1111',
  ])('allows public address %s', (ip) => expect(isBlockedAddress(ip)).toBe(false));
});

describe('assertSafeUrl', () => {
  it.each([
    'ftp://example.com/file',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'gopher://example.com',
    'http://user:pass@example.com/',
    'http://example.com:8080/',
    'http://example.com:22/',
    'http://localhost/',
    'http://LOCALHOST./',
    'http://app.localhost/',
    'http://intranet/',
    'http://printer.local/',
    'http://db.internal/',
    'http://metadata.google.internal/computeMetadata/v1/',
    'http://127.0.0.1/',
    'http://127.1/',
    'http://2130706433/', // decimal form of 127.0.0.1
    'http://0x7f000001/', // hex form
    'http://0177.0.0.1/', // octal form
    'http://169.254.169.254/latest/meta-data/',
    'http://[::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://[fe80::1]/',
    'http://10.0.0.5/admin',
    'not a url',
  ])('rejects %s', async (url) => {
    await expect(assertSafeUrl(url, publicResolver)).rejects.toThrow();
  });

  it('rejects public-looking hostnames that resolve to private addresses (DNS tricks)', async () => {
    await expect(
      assertSafeUrl('http://evil.example.com/', async () => ['10.0.0.5']),
    ).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(
      assertSafeUrl('http://evil.example.com/', async () => ['169.254.169.254']),
    ).rejects.toBeInstanceOf(UnsafeUrlError);
    // a mixed answer is rejected as a whole
    await expect(
      assertSafeUrl('http://evil.example.com/', async () => [PUBLIC, '127.0.0.1']),
    ).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(
      assertSafeUrl('http://evil.example.com/', async () => ['::1']),
    ).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it('reports unresolvable hosts as a normal failure and accepts safe URLs', async () => {
    await expect(assertSafeUrl('https://nope.example.com/', async () => [])).rejects.toBeInstanceOf(
      FetchFailedError,
    );
    await expect(
      assertSafeUrl('https://nope.example.com/', async () => {
        throw new Error('ENOTFOUND');
      }),
    ).rejects.toBeInstanceOf(FetchFailedError);
    const ok = await assertSafeUrl('https://www.example.com/page?x=1', publicResolver);
    expect(ok).toMatchObject({ address: PUBLIC, family: 4 });
    expect((await assertSafeUrl('https://example.com:443/', publicResolver)).url.hostname).toBe(
      'example.com',
    );
    expect((await assertSafeUrl('http://[2606:4700:4700::1111]/', publicResolver)).family).toBe(6);
  });
});

describe('safeFetchText', () => {
  it('fetches a page and decodes it', async () => {
    const transport: Transport = jest.fn(async () => html('<p>Bonjour é</p>'));
    const page = await safeFetchText('https://example.com/a', {
      resolver: publicResolver,
      transport,
    });
    expect(page).toMatchObject({ finalUrl: 'https://example.com/a', body: '<p>Bonjour é</p>' });
    const req = (transport as jest.Mock).mock.calls[0][0];
    expect(req.address).toBe(PUBLIC); // connects to the validated, pinned address
    expect(req.headers['User-Agent']).toContain('AIContentHubBot');
  });

  it('follows safe redirects, resolving relative locations', async () => {
    const urls: string[] = [];
    const transport: Transport = async (r) => {
      urls.push(r.url.toString());
      return urls.length === 1 ? redirect('/final') : html('done');
    };
    const page = await safeFetchText('https://example.com/start', {
      resolver: publicResolver,
      transport,
    });
    expect(urls).toEqual(['https://example.com/start', 'https://example.com/final']);
    expect(page.finalUrl).toBe('https://example.com/final');
  });

  it.each([
    'http://127.0.0.1/admin',
    'http://169.254.169.254/latest/meta-data/',
    'http://localhost:80/',
    'file:///etc/passwd',
    'http://[::1]/',
  ])('blocks a redirect to %s', async (target) => {
    const transport: Transport = jest.fn(async () => redirect(target));
    await expect(
      safeFetchText('https://example.com/', { resolver: publicResolver, transport }),
    ).rejects.toBeInstanceOf(UnsafeUrlError);
    expect(transport).toHaveBeenCalledTimes(1); // never connected to the unsafe hop
  });

  it('revalidates DNS on every hop (a redirect to a host that now resolves privately is blocked)', async () => {
    const resolver = jest.fn(async (host: string) =>
      host === 'second.example.com' ? ['192.168.1.10'] : [PUBLIC],
    );
    const transport: Transport = async () => redirect('https://second.example.com/');
    await expect(
      safeFetchText('https://first.example.com/', { resolver, transport }),
    ).rejects.toBeInstanceOf(UnsafeUrlError);
    expect(resolver).toHaveBeenCalledTimes(2);
  });

  it('stops redirect loops', async () => {
    const transport: Transport = async () => redirect('https://example.com/again');
    await expect(
      safeFetchText('https://example.com/', { resolver: publicResolver, transport }),
    ).rejects.toThrow(/too many/i);
  });

  it('rejects non-text content types without reading them', async () => {
    const transport: Transport = async () =>
      new Response('%PDF', { status: 200, headers: { 'content-type': 'application/pdf' } });
    await expect(
      safeFetchText('https://example.com/f.pdf', { resolver: publicResolver, transport }),
    ).rejects.toThrow(/web pages and plain text/);
  });

  it('enforces the response size limit (declared and streamed)', async () => {
    const declared: Transport = async () => html('x', { 'content-length': '999999999' });
    await expect(
      safeFetchText('https://example.com/', {
        resolver: publicResolver,
        transport: declared,
        maxBytes: 1000,
      }),
    ).rejects.toThrow(/too large/);
    const streamed: Transport = async () => html('y'.repeat(5000));
    await expect(
      safeFetchText('https://example.com/', {
        resolver: publicResolver,
        transport: streamed,
        maxBytes: 1000,
      }),
    ).rejects.toThrow(/too large/);
  });

  it('respects sites that refuse automated access instead of working around it', async () => {
    for (const status of [401, 403, 429, 503]) {
      const transport: Transport = async () => new Response('blocked', { status });
      await expect(
        safeFetchText('https://example.com/', { resolver: publicResolver, transport }),
      ).rejects.toThrow(/does not allow automated access/);
    }
    const err500: Transport = async () => new Response('x', { status: 500 });
    await expect(
      safeFetchText('https://example.com/', { resolver: publicResolver, transport: err500 }),
    ).rejects.toThrow(/error \(500\)/);
  });

  it('never calls the network for an unsafe starting URL', async () => {
    const transport: Transport = jest.fn();
    await expect(
      safeFetchText('http://10.1.2.3/', { resolver: publicResolver, transport }),
    ).rejects.toBeInstanceOf(UnsafeUrlError);
    expect(transport).not.toHaveBeenCalled();
  });
});

describe('robots.txt', () => {
  const robots =
    'User-agent: *\nDisallow: /private\nAllow: /private/open\nDisallow: /exact$\n\nUser-agent: AIContentHubBot\nDisallow: /bot-only';

  it('parses groups and applies the most specific rule', () => {
    const generic = parseRobots(robots.split('\n\nUser-agent: AIContentHubBot')[0]);
    expect(isPathAllowed(generic, '/public')).toBe(true);
    expect(isPathAllowed(generic, '/private/x')).toBe(false);
    expect(isPathAllowed(generic, '/private/open/page')).toBe(true);
    expect(isPathAllowed(generic, '/exact')).toBe(false);
    expect(isPathAllowed(generic, '/exact/more')).toBe(true);
  });

  it('prefers a group naming our bot over the wildcard group', () => {
    const rules = parseRobots(robots);
    expect(isPathAllowed(rules, '/bot-only/page')).toBe(false);
    expect(isPathAllowed(rules, '/private/x')).toBe(true); // wildcard group is not used when a specific one exists
  });

  it('blocks pages the site disallows and allows others / missing robots.txt', async () => {
    const transport: Transport = async (r) =>
      r.url.pathname === '/robots.txt'
        ? new Response('User-agent: *\nDisallow: /members', {
            status: 200,
            headers: { 'content-type': 'text/plain' },
          })
        : html('x');
    const opts = { resolver: publicResolver, transport };
    expect(await isAllowedByRobots('https://example.com/members/area', opts)).toBe(false);
    expect(await isAllowedByRobots('https://example.com/news', opts)).toBe(true);
    const none: Transport = async () => new Response('nf', { status: 404 });
    expect(
      await isAllowedByRobots('https://example.com/members/area', {
        resolver: publicResolver,
        transport: none,
      }),
    ).toBe(true);
  });
});
