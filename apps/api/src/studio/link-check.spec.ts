import { checkLink, checkLinks, linksIn } from './link-check';

const publicResolver = async () => ['93.184.216.34'];
const res = (status: number, headers: Record<string, string> = {}) =>
  new Response(null, { status, headers });

describe('linksIn', () => {
  it('finds markdown and bare links, skips pictures and duplicates', () => {
    const out = linksIn([
      'See [a](https://a.example/x) and https://b.example/y. ![p](media:123 "c") [a again](https://a.example/x)',
    ]);
    expect(out).toEqual(['https://a.example/x', 'https://b.example/y']);
  });
  it('caps the number of links', () => {
    const text = Array.from({ length: 30 }, (_, i) => `[l](https://e.example/${i})`).join(' ');
    expect(linksIn([text])).toHaveLength(15);
  });
});

describe('checkLink', () => {
  it('reports working, broken and unverified links', async () => {
    const codes: Record<string, number> = { '/ok': 200, '/gone': 404, '/wall': 403 };
    const transport = async (r: any) => res(codes[r.url.pathname] ?? 500);
    const d = { resolver: publicResolver, transport };
    expect((await checkLink('https://a.example/ok', d)).status).toBe('ok');
    expect((await checkLink('https://a.example/gone', d)).status).toBe('broken');
    expect((await checkLink('https://a.example/wall', d)).status).toBe('unverified');
  });

  it('never contacts private addresses', async () => {
    const transport = jest.fn();
    const r = await checkLink('http://localhost/admin', { transport });
    expect(r.status).toBe('unsafe');
    const r2 = await checkLink('https://a.example/', {
      resolver: async () => ['10.0.0.5'],
      transport,
    });
    expect(r2.status).toBe('unsafe');
    expect(transport).not.toHaveBeenCalled();
  });

  it('follows redirects and reports the final address', async () => {
    const transport = async (r: any) =>
      r.url.pathname === '/old' ? res(301, { location: '/new' }) : res(200);
    const r = await checkLink('https://a.example/old', { resolver: publicResolver, transport });
    expect(r).toMatchObject({ status: 'redirect', finalUrl: 'https://a.example/new' });
  });

  it('refuses a redirect into a private address', async () => {
    const resolver = async (h: string) =>
      h === 'evil.example' ? ['127.0.0.1'] : ['93.184.216.34'];
    const transport = async () => res(302, { location: 'https://evil.example/' });
    const r = await checkLink('https://a.example/', { resolver, transport });
    expect(r.status).toBe('unsafe');
  });

  it('falls back to GET when HEAD is not allowed', async () => {
    const methods: string[] = [];
    const transport = async (r: any) => {
      methods.push(r.method);
      return res(r.method === 'HEAD' ? 405 : 200);
    };
    const r = await checkLink('https://a.example/', { resolver: publicResolver, transport });
    expect(r.status).toBe('ok');
    expect(methods).toEqual(['HEAD', 'GET']);
  });

  it('gives up on redirect loops', async () => {
    const transport = async () => res(302, { location: '/again' });
    const r = await checkLink('https://a.example/', { resolver: publicResolver, transport });
    expect(r.status).toBe('broken');
  });
});

describe('checkLinks', () => {
  it('keeps the order of the results', async () => {
    const transport = async (r: any) => res(r.url.pathname === '/2' ? 404 : 200);
    const out = await checkLinks(
      ['https://a.example/1', 'https://a.example/2', 'https://a.example/3'],
      { resolver: publicResolver, transport },
    );
    expect(out.map((x) => x.status)).toEqual(['ok', 'broken', 'ok']);
  });
});
