import { randomBytes } from 'crypto';
import { UnprocessableEntityException } from '@nestjs/common';
import { articleHtml } from './article-html';
import { ChannelAuthError, PermanentPublishError } from './publisher';
import { renderPost } from './publishing-rules';
import { FetchFailedError, HttpClient, makeSafeJsonRequest, UnsafeUrlError } from './safe-request';
import { SecretsService } from './secrets.service';
import { normalizeSiteUrl, WordPressPublisher } from './wordpress.publisher';

const KEY = randomBytes(32).toString('base64');
const withKey = (key: string | undefined, fn: () => void) => {
  const prev = process.env.ENCRYPTION_KEY;
  if (key === undefined) delete process.env.ENCRYPTION_KEY;
  else process.env.ENCRYPTION_KEY = key;
  try {
    fn();
  } finally {
    if (prev === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = prev;
  }
};

describe('article HTML', () => {
  const article = {
    introduction: 'Intro with <b>tags</b> & "quotes".\n\nSecond paragraph.',
    sections: [
      {
        heading: 'What to expect',
        body: 'Line one\nline two',
        subsections: [{ heading: 'Details', body: 'More' }],
      },
    ],
    conclusion: 'See you there.',
    faq: [{ question: 'Where?', answer: 'Rabat.' }],
  };

  it('builds semantic HTML and escapes everything the model wrote', () => {
    const html = articleHtml(article, 'en');
    expect(html).toContain('<p>Intro with &lt;b&gt;tags&lt;/b&gt; &amp; &quot;quotes&quot;.</p>');
    expect(html).toContain('<p>Second paragraph.</p>');
    expect(html).toContain('<h2>What to expect</h2>');
    expect(html).toContain('<p>Line one<br>line two</p>');
    expect(html).toContain('<h3>Details</h3>');
    expect(html).toContain('<h2>FAQ</h2>');
    expect(html).toContain('<h3>Where?</h3>');
    expect(html).not.toContain('<b>');
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toContain('<h1>'); // the site renders the post title itself
  });

  it('wraps Arabic right-to-left and survives missing parts', () => {
    expect(articleHtml(article, 'ar')).toMatch(/^<div dir="rtl" lang="ar">/);
    expect(articleHtml({ sections: [] }, 'en')).toBe('');
    expect(articleHtml(null)).toBe('');
  });

  it('is part of the article payload, together with slug, excerpt and language', () => {
    const p = renderPost(
      'ARTICLE',
      'fallback',
      { ...article, h1: 'Main', slug: 'open-day', excerpt: 'Ex' },
      'fr',
    );
    expect(p.title).toBe('Main');
    expect(p.slug).toBe('open-day');
    expect(p.excerpt).toBe('Ex');
    expect(p.language).toBe('fr');
    expect(p.html).toContain('<h2>What to expect</h2>');
  });
});

describe('stored logins', () => {
  const secrets = new SecretsService();

  it('encrypts and decrypts, with a different ciphertext every time', () => {
    withKey(KEY, () => {
      const login = { username: 'editor', applicationPassword: 'abcd efgh ijkl' };
      const a = secrets.encrypt(login);
      const b = secrets.encrypt(login);
      expect(a).not.toBe(b);
      expect(a).not.toContain('abcd efgh');
      expect(a).not.toContain('editor');
      expect(secrets.decrypt(a)).toEqual(login);
    });
  });

  it('rejects tampering and the wrong key', () => {
    let stored = '';
    withKey(KEY, () => {
      stored = secrets.encrypt({ a: 'secret' });
      const parts = stored.split(':');
      parts[3] = Buffer.from('tampered-data').toString('base64');
      expect(() => secrets.decrypt(parts.join(':'))).toThrow();
      expect(() => secrets.decrypt('not-a-valid-value')).toThrow();
    });
    withKey(randomBytes(32).toString('base64'), () => {
      expect(() => secrets.decrypt(stored)).toThrow();
    });
  });

  it('refuses to work without a proper key, and says so clearly', () => {
    withKey(undefined, () => {
      expect(secrets.configured).toBe(false);
      expect(() => secrets.encrypt({ a: 'b' })).toThrow(UnprocessableEntityException);
    });
    withKey(randomBytes(16).toString('base64') + 'x'.repeat(30), () => {
      expect(secrets.configured).toBe(false); // long enough to pass env validation, wrong size
    });
    withKey(KEY, () => expect(secrets.configured).toBe(true));
  });
});

describe('safe JSON requests', () => {
  const publicResolver = async () => ['93.184.216.34'];
  const respond = (status: number, body: string, headers: Record<string, string> = {}) =>
    new Response(body, { status, headers });

  it('sends the method, body and headers, and parses the answer', async () => {
    const seen: any[] = [];
    const http = makeSafeJsonRequest({
      resolver: publicResolver,
      transport: async (req) => {
        seen.push(req);
        return respond(201, '{"id":7}');
      },
    });
    const res = await http('https://site.example/wp-json/wp/v2/posts', {
      method: 'POST',
      headers: { Authorization: 'Basic abc' },
      body: { title: 'T' },
    });
    expect(res).toEqual({
      status: 201,
      json: { id: 7 },
      headers: { 'content-type': 'text/plain;charset=UTF-8' }, // headers are returned, lower-cased
    });
    expect(seen[0].method).toBe('POST');
    expect(seen[0].body).toBe('{"title":"T"}');
    expect(seen[0].headers.Authorization).toBe('Basic abc');
    expect(seen[0].headers['Content-Type']).toBe('application/json');
    expect(seen[0].address).toBe('93.184.216.34'); // the checked address is the one used
  });

  it('returns null for empty or non-JSON bodies', async () => {
    const http = makeSafeJsonRequest({
      resolver: publicResolver,
      transport: async () => respond(200, '<html>not json</html>'),
    });
    expect((await http('https://site.example/')).json).toBeNull();
  });

  it('never connects to private addresses', async () => {
    const transport = jest.fn();
    const privateDns = makeSafeJsonRequest({ resolver: async () => ['10.0.0.5'], transport });
    await expect(privateDns('https://intranet.example/')).rejects.toThrow(UnsafeUrlError);
    const direct = makeSafeJsonRequest({ transport });
    await expect(direct('https://127.0.0.1/')).rejects.toThrow(UnsafeUrlError);
    await expect(direct('https://localhost/')).rejects.toThrow(UnsafeUrlError);
    await expect(direct('https://site.example:8443/')).rejects.toThrow(UnsafeUrlError);
    await expect(direct('ftp://site.example/')).rejects.toThrow(UnsafeUrlError);
    expect(transport).not.toHaveBeenCalled();
  });

  it('does not follow redirects, so the login cannot be sent to another host', async () => {
    const transport = jest.fn(async () =>
      respond(301, '', { location: 'https://evil.example/steal' }),
    );
    const http = makeSafeJsonRequest({ resolver: publicResolver, transport });
    await expect(
      http('https://site.example/wp-json', { headers: { Authorization: 'Basic abc' } }),
    ).rejects.toThrow(FetchFailedError);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('refuses oversized answers', async () => {
    const http = makeSafeJsonRequest({
      resolver: publicResolver,
      transport: async () => respond(200, 'x'.repeat(2 * 1024 * 1024 + 10)),
    });
    await expect(http('https://site.example/')).rejects.toThrow(/too much data/);
  });
});

describe('WordPress publisher', () => {
  const site = 'https://site.example';
  const input = {
    siteUrl: 'https://site.example/',
    username: 'editor',
    applicationPassword: 'abcd efgh ijkl mnop',
  };
  const me = (over: Record<string, unknown> = {}) => ({
    status: 200,
    json: {
      id: 3,
      name: 'Editor Jane',
      capabilities: { publish_posts: true, edit_posts: true },
      ...over,
    },
  });
  const make = (impl: HttpClient) => {
    const http = jest.fn(impl);
    return { http, wp: new WordPressPublisher(http) };
  };
  const payload = {
    kind: 'ARTICLE' as const,
    title: 'Open Day',
    text: 'x',
    html: '<p>Body</p>',
    slug: 'open-day',
    excerpt: 'Short',
  };
  const channel = (over: Record<string, unknown> = {}) => ({
    id: 'c1',
    name: 'Site',
    config: { siteUrl: site, publishAs: 'publish' },
    secret: { username: 'editor', applicationPassword: 'abcd efgh ijkl mnop' },
    ...over,
  });

  it('only publishes articles', () => {
    const { wp } = make(async () => me());
    expect(wp.supports('ARTICLE')).toBe(true);
    expect(wp.supports('INSTAGRAM')).toBe(false);
    expect(wp.supports('FACEBOOK')).toBe(false);
    expect(wp.supports('LINKEDIN')).toBe(false);
  });

  it('normalizes the address and demands https', () => {
    expect(normalizeSiteUrl('https://Site.example/blog/?a=1#x')).toBe('https://site.example/blog');
    expect(normalizeSiteUrl('https://site.example/')).toBe('https://site.example');
    expect(() => normalizeSiteUrl('http://site.example')).toThrow(/https/);
  });

  describe('connecting', () => {
    it('verifies the login against the site and keeps only what is needed', async () => {
      const { wp, http } = make(async () => me());
      const r = await wp.prepare({ ...input, publishAs: 'draft' });
      expect(r.config).toEqual({ siteUrl: site, publishAs: 'draft', wordpressUser: 'Editor Jane' });
      expect(r.secret).toEqual({ username: 'editor', applicationPassword: 'abcd efgh ijkl mnop' });
      const [url, opts] = http.mock.calls[0];
      expect(url).toBe(`${site}/wp-json/wp/v2/users/me?context=edit`);
      expect(opts?.headers?.Authorization).toBe(
        'Basic ' + Buffer.from('editor:abcd efgh ijkl mnop').toString('base64'),
      );
    });

    const rejects = async (
      impl: HttpClient,
      message: RegExp,
      body: Record<string, unknown> = input,
    ) => {
      const { wp } = make(impl);
      await expect(wp.prepare(body)).rejects.toThrow(UnprocessableEntityException);
      await expect(wp.prepare(body)).rejects.toThrow(message);
    };

    it('explains each way a connection can fail', async () => {
      await rejects(
        async () => ({ status: 401, json: { code: 'incorrect_password' } }),
        /did not accept/,
      );
      await rejects(async () => ({ status: 404, json: null }), /REST API was not found/);
      await rejects(async () => ({ status: 200, json: null }), /does not look like a WordPress/);
      await rejects(async () => ({ status: 500, json: null }), /error \(500\)/);
      await rejects(
        async () => me({ capabilities: { publish_posts: false } }),
        /not allowed to publish/,
      );
      await rejects(async () => {
        throw new FetchFailedError('The website took too long to respond');
      }, /took too long/);
      await rejects(async () => {
        throw new UnsafeUrlError('This address is not allowed');
      }, /cannot be used/);
      await rejects(async () => me(), /https/, { ...input, siteUrl: 'http://site.example' });
    });

    it('lets a contributor-level user connect only for drafts', async () => {
      const caps = { capabilities: { publish_posts: false, edit_posts: true } };
      const { wp } = make(async () => me(caps));
      await expect(wp.prepare({ ...input, publishAs: 'publish' })).rejects.toThrow(/publish posts/);
      await expect(wp.prepare({ ...input, publishAs: 'draft' })).resolves.toBeTruthy();
    });

    it('validates the form fields', async () => {
      const { wp, http } = make(async () => me());
      await expect(wp.prepare({ ...input, siteUrl: 'not a url' })).rejects.toThrow();
      await expect(wp.prepare({ ...input, username: '' })).rejects.toThrow();
      await expect(wp.prepare({ ...input, applicationPassword: 'short' })).rejects.toThrow();
      expect(http).not.toHaveBeenCalled(); // nothing is sent for invalid input
    });
  });

  describe('publishing', () => {
    it('creates the post with the article HTML, slug, excerpt and status', async () => {
      const { wp, http } = make(async (url, o) =>
        o?.method === 'POST'
          ? { status: 201, json: { id: 42, link: `${site}/open-day/` } }
          : { status: 200, json: [] },
      );
      const r = await wp.publish(channel(), payload);
      expect(r).toEqual({ externalId: '42', url: `${site}/open-day/` });
      const post = http.mock.calls.find(([, o]) => o?.method === 'POST')!;
      expect(post[0]).toBe(`${site}/wp-json/wp/v2/posts`);
      expect(post[1]?.body).toEqual({
        title: 'Open Day',
        content: '<p>Body</p>',
        excerpt: 'Short',
        slug: 'open-day',
        status: 'publish',
      });
      expect(post[1]?.headers?.Authorization).toMatch(/^Basic /);
    });

    it('saves a draft when the channel is set to draft', async () => {
      const { wp, http } = make(async (_u, o) =>
        o?.method === 'POST'
          ? { status: 201, json: { id: 1, link: 'l' } }
          : { status: 200, json: [] },
      );
      await wp.publish(channel({ config: { siteUrl: site, publishAs: 'draft' } }), payload);
      expect(http.mock.calls.find(([, o]) => o?.method === 'POST')![1]?.body).toMatchObject({
        status: 'draft',
      });
    });

    it('does not create a second copy when the post already exists (a retry after a lost answer)', async () => {
      const { wp, http } = make(async () => ({
        status: 200,
        json: [{ id: 9, slug: 'open-day', link: `${site}/open-day/`, title: { raw: 'Open Day' } }],
      }));
      const r = await wp.publish(channel(), payload);
      expect(r).toEqual({ externalId: '9', url: `${site}/open-day/` });
      expect(http.mock.calls.some(([, o]) => o?.method === 'POST')).toBe(false);
    });

    it('still creates the post when the slug belongs to a different article', async () => {
      const { wp, http } = make(async (_u, o) =>
        o?.method === 'POST'
          ? { status: 201, json: { id: 5, link: 'l' } }
          : { status: 200, json: [{ id: 9, slug: 'open-day', title: { raw: 'Something else' } }] },
      );
      expect((await wp.publish(channel(), payload)).externalId).toBe('5');
      expect(http.mock.calls.some(([, o]) => o?.method === 'POST')).toBe(true);
    });

    const failing = (status: number, json: any = null) =>
      make(async (_u, o) => (o?.method === 'POST' ? { status, json } : { status: 200, json: [] }));

    it('treats a rejected login as permanent and tells the channel to be reconnected', async () => {
      await expect(failing(401).wp.publish(channel(), payload)).rejects.toThrow(ChannelAuthError);
      await expect(failing(403).wp.publish(channel(), payload)).rejects.toThrow(/Reconnect/);
      await expect(
        make(async () => me()).wp.publish(channel({ secret: null }), payload),
      ).rejects.toThrow(ChannelAuthError);
    });

    it('treats a refused post as permanent, with the reason from WordPress', async () => {
      const r = failing(400, { message: 'Invalid <b>slug</b>' });
      const err = await r.wp.publish(channel(), payload).catch((e) => e);
      expect(err).toBeInstanceOf(PermanentPublishError);
      expect(err).not.toBeInstanceOf(ChannelAuthError);
      expect(err.message).toBe('WordPress refused the post (400): Invalid slug');
    });

    it('treats outages and network trouble as retryable', async () => {
      for (const status of [429, 500, 503]) {
        const err = await failing(status)
          .wp.publish(channel(), payload)
          .catch((e) => e);
        expect(err).toBeInstanceOf(Error);
        expect(err).not.toBeInstanceOf(PermanentPublishError);
      }
      const net = make(async () => {
        throw new FetchFailedError('The website took too long to respond');
      });
      const err = await net.wp.publish(channel(), payload).catch((e) => e);
      expect(err).not.toBeInstanceOf(PermanentPublishError);
      expect(err.message).toMatch(/took too long/);
    });

    it('refuses to publish an article without a body or slug', async () => {
      const { wp, http } = make(async () => me());
      await expect(wp.publish(channel(), { ...payload, html: '' })).rejects.toThrow(
        PermanentPublishError,
      );
      await expect(wp.publish(channel(), { ...payload, slug: undefined })).rejects.toThrow(
        PermanentPublishError,
      );
      expect(http).not.toHaveBeenCalled();
    });
  });
});
