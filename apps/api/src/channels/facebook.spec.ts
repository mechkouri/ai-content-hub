import { UnprocessableEntityException } from '@nestjs/common';
import { FacebookPublisher } from './facebook.publisher';
import { ChannelAuthError, PermanentPublishError } from './publisher';
import { buildMultipart, FetchFailedError, HttpClient, makeSafeJsonRequest } from './safe-request';

const GRAPH = 'https://graph.facebook.com/v21.0';
const TOKEN = 'EAAB' + 'x'.repeat(40);

describe('multipart uploads', () => {
  it('builds a body with fields and the exact file bytes', () => {
    const file = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0x0d, 0x0a, 0x1a]);
    const { contentType, data } = buildMultipart(
      { caption: 'Hello "world"', published: 'true' },
      { field: 'source', filename: 'a.png', mimeType: 'image/png', data: file },
    );
    const boundary = /boundary=(.+)$/.exec(contentType)![1];
    const text = data.toString('latin1');
    expect(text).toContain(
      `--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\nHello "world"\r\n`,
    );
    expect(text).toContain('name="published"\r\n\r\ntrue\r\n');
    expect(text).toContain('name="source"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n');
    expect(text.endsWith(`\r\n--${boundary}--\r\n`)).toBe(true);
    expect(data.indexOf(file)).toBeGreaterThan(0); // binary bytes are untouched
  });

  it('cannot be tricked by quotes or line breaks in names', () => {
    const { data } = buildMultipart(
      {},
      {
        field: 'source',
        filename: 'x"\r\nContent-Type: text/html',
        mimeType: 'image/png',
        data: Buffer.from('d'),
      },
    );
    expect(data.toString()).toContain(
      'filename="x"__Content-Type: text/html"'.replace('x"__', 'x___'),
    );
    expect(data.toString()).not.toMatch(/\r\nContent-Type: text\/html/);
  });

  it('is sent as the raw body by the safe client', async () => {
    const seen: any[] = [];
    const http = makeSafeJsonRequest({
      resolver: async () => ['93.184.216.34'],
      transport: async (req) => {
        seen.push(req);
        return new Response('{"id":"1"}', { status: 200 });
      },
    });
    const raw = buildMultipart(
      { a: 'b' },
      { field: 'f', filename: 'n.png', mimeType: 'image/png', data: Buffer.from('xyz') },
    );
    await http('https://graph.facebook.com/v21.0/1/photos', { method: 'POST', raw });
    expect(seen[0].body).toBe(raw.data);
    expect(seen[0].headers['Content-Type']).toBe(raw.contentType);
  });
});

describe('Facebook publisher', () => {
  const make = (impl: HttpClient) => {
    const http = jest.fn(impl);
    return { http, fb: new FacebookPublisher(http) };
  };
  const ok = (json: any) => ({ status: 200, json });
  const graphErr = (status: number, code: number, message = 'Problem') => ({
    status,
    json: { error: { code, message } },
  });
  const channel = (over: Record<string, unknown> = {}) => ({
    id: 'c1',
    name: 'My page',
    config: { pageId: '1234567890', pageName: 'Atlas' },
    secret: { accessToken: TOKEN },
    ...over,
  });
  const payload = {
    kind: 'FACEBOOK' as const,
    title: 'Open Day',
    text: 'Open Day on 14 March!\n\n#OpenDay',
    link: null as string | null,
  };
  const photo = (name: string) => ({
    filename: name,
    mimeType: 'image/png',
    data: Buffer.from('img-' + name),
  });

  it('only publishes Facebook posts', () => {
    const { fb } = make(async () => ok({}));
    expect(fb.supports('FACEBOOK')).toBe(true);
    for (const k of ['ARTICLE', 'INSTAGRAM', 'LINKEDIN'] as const)
      expect(fb.supports(k)).toBe(false);
  });

  describe('connecting', () => {
    const input = { pageId: '1234567890', accessToken: TOKEN };

    it('verifies the token belongs to the Page and keeps the token only as a secret', async () => {
      const { fb, http } = make(async () => ok({ id: '1234567890', name: 'Atlas University' }));
      const r = await fb.prepare(input);
      expect(r.config).toEqual({ pageId: '1234567890', pageName: 'Atlas University' });
      expect(r.secret).toEqual({ accessToken: TOKEN });
      const [url, opts] = http.mock.calls[0];
      expect(url).toBe(`${GRAPH}/me?fields=id,name`);
      expect(opts?.headers?.Authorization).toBe(`Bearer ${TOKEN}`); // never in the address
      expect(String(url)).not.toContain(TOKEN);
    });

    const rejects = async (
      impl: HttpClient,
      message: RegExp,
      body: Record<string, unknown> = input,
    ) => {
      const { fb } = make(impl);
      await expect(fb.prepare(body)).rejects.toThrow(UnprocessableEntityException);
      await expect(fb.prepare(body)).rejects.toThrow(message);
    };

    it('explains each way connecting can fail', async () => {
      await rejects(
        async () => graphErr(400, 190, 'Invalid OAuth access token'),
        /did not accept that access token/,
      );
      await rejects(async () => ({ status: 401, json: null }), /did not accept/);
      await rejects(async () => ok({ id: '999', name: 'Someone' }), /does not belong to that Page/);
      await rejects(
        async () => graphErr(400, 100, 'Unsupported get request'),
        /refused the connection: Unsupported get request/,
      );
      await rejects(async () => {
        throw new FetchFailedError('The website took too long to respond');
      }, /took too long/);
    });

    it('validates the fields before contacting Facebook', async () => {
      const { fb, http } = make(async () => ok({}));
      await expect(fb.prepare({ ...input, pageId: 'my-page' })).rejects.toThrow();
      await expect(fb.prepare({ ...input, pageId: '12' })).rejects.toThrow();
      await expect(fb.prepare({ ...input, accessToken: 'short' })).rejects.toThrow();
      expect(http).not.toHaveBeenCalled();
    });
  });

  describe('publishing', () => {
    it('posts text, with the link, to the Page feed', async () => {
      const { fb, http } = make(async () => ok({ id: '1234567890_555' }));
      const r = await fb.publish(
        channel(),
        { ...payload, link: 'https://atlas.example/open-day' },
        [],
      );
      expect(r).toEqual({
        externalId: '1234567890_555',
        url: 'https://www.facebook.com/1234567890_555',
      });
      const [url, opts] = http.mock.calls[0];
      expect(url).toBe(`${GRAPH}/1234567890/feed`);
      expect(opts?.method).toBe('POST');
      expect(opts?.body).toEqual({ message: payload.text, link: 'https://atlas.example/open-day' });
      expect(opts?.headers?.Authorization).toBe(`Bearer ${TOKEN}`);
    });

    it('posts one picture with the text as caption and the link inside it', async () => {
      const { fb, http } = make(async () => ok({ id: '77', post_id: '1234567890_77' }));
      const r = await fb.publish(
        channel(),
        { ...payload, link: 'https://atlas.example/open-day' },
        [photo('a.png')],
      );
      expect(r.externalId).toBe('1234567890_77');
      const [url, opts] = http.mock.calls[0];
      expect(url).toBe(`${GRAPH}/1234567890/photos`);
      const body = opts!.raw!.data.toString('latin1');
      expect(body).toContain(
        'name="caption"\r\n\r\nOpen Day on 14 March!\n\n#OpenDay\n\nhttps://atlas.example/open-day',
      );
      expect(body).toContain('name="published"\r\n\r\ntrue');
      expect(body).toContain('img-a.png');
      expect(http).toHaveBeenCalledTimes(1);
    });

    it('does not repeat a link the text already contains', async () => {
      const { fb, http } = make(async () => ok({ id: '1', post_id: 'p' }));
      await fb.publish(
        channel(),
        { ...payload, text: 'Join: https://a.example', link: 'https://a.example' },
        [photo('a.png')],
      );
      const body = http.mock.calls[0][1]!.raw!.data.toString('latin1');
      expect(body.match(/https:\/\/a\.example/g)).toHaveLength(1);
    });

    it('uploads several pictures unpublished, then publishes one post with all of them', async () => {
      let n = 0;
      const { fb, http } = make(async (url) =>
        String(url).endsWith('/photos') ? ok({ id: `photo-${++n}` }) : ok({ id: '1234567890_9' }),
      );
      const r = await fb.publish(channel(), payload, [
        photo('a.png'),
        photo('b.png'),
        photo('c.png'),
      ]);
      expect(r.externalId).toBe('1234567890_9');
      const calls = http.mock.calls;
      expect(calls).toHaveLength(4);
      for (const [url, opts] of calls.slice(0, 3)) {
        expect(url).toBe(`${GRAPH}/1234567890/photos`);
        expect(opts!.raw!.data.toString('latin1')).toContain('name="published"\r\n\r\nfalse');
      }
      expect(calls[3][0]).toBe(`${GRAPH}/1234567890/feed`);
      expect(calls[3][1]?.body).toEqual({
        message: payload.text,
        attached_media: [
          { media_fbid: 'photo-1' },
          { media_fbid: 'photo-2' },
          { media_fbid: 'photo-3' },
        ],
      });
    });

    it('treats a rejected token or permission as permanent so the channel is flagged', async () => {
      for (const err of [
        graphErr(400, 190),
        graphErr(403, 200),
        graphErr(400, 10),
        { status: 401, json: null },
      ]) {
        const { fb } = make(async () => err);
        await expect(fb.publish(channel(), payload, [])).rejects.toThrow(ChannelAuthError);
      }
      const { fb } = make(async () => ok({}));
      await expect(fb.publish(channel({ secret: null }), payload, [])).rejects.toThrow(
        ChannelAuthError,
      );
    });

    it('retries rate limits', async () => {
      for (const err of [
        { status: 429, json: null },
        graphErr(400, 4),
        graphErr(400, 32),
        graphErr(400, 613),
      ]) {
        const { fb } = make(async () => err);
        const e = await fb.publish(channel(), payload, []).catch((x) => x);
        expect(e).toBeInstanceOf(Error);
        expect(e).not.toBeInstanceOf(PermanentPublishError);
        expect(e.message).toMatch(/limiting/);
      }
    });

    it('does not retry a refused post, and shows Facebook’s reason without markup', async () => {
      const { fb } = make(async () => graphErr(400, 100, 'Invalid <b>parameter</b>'));
      const e = await fb.publish(channel(), payload, []).catch((x) => x);
      expect(e).toBeInstanceOf(PermanentPublishError);
      expect(e).not.toBeInstanceOf(ChannelAuthError);
      expect(e.message).toBe('Facebook refused the post: Invalid parameter.');
    });

    it('never retries a lost answer from the request that publishes, to avoid posting twice', async () => {
      const lost = make(async () => {
        throw new FetchFailedError('The website took too long to respond');
      });
      const e = await lost.fb.publish(channel(), payload, []).catch((x) => x);
      expect(e).toBeInstanceOf(PermanentPublishError);
      expect(e.message).toMatch(/check your Page/i);

      const serverError = make(async () => ({ status: 500, json: null }));
      const e2 = await serverError.fb.publish(channel(), payload, []).catch((x) => x);
      expect(e2).toBeInstanceOf(PermanentPublishError);
      expect(e2.message).toMatch(/did not confirm/);

      const noId = make(async () => ok({}));
      await expect(noId.fb.publish(channel(), payload, [])).rejects.toThrow(PermanentPublishError);
    });

    it('does retry picture uploads that fail, because nothing is public yet', async () => {
      const { fb, http } = make(async () => ({ status: 503, json: null }));
      const e = await fb
        .publish(channel(), payload, [photo('a.png'), photo('b.png')])
        .catch((x) => x);
      expect(e).not.toBeInstanceOf(PermanentPublishError);
      expect(e.message).toMatch(/not available right now/);
      expect(http).toHaveBeenCalledTimes(1); // stopped at the first failed upload

      const net = make(async () => {
        throw new FetchFailedError('Could not connect to the website');
      });
      const e2 = await net.fb
        .publish(channel(), payload, [photo('a.png'), photo('b.png')])
        .catch((x) => x);
      expect(e2).not.toBeInstanceOf(PermanentPublishError);
    });
  });
});
