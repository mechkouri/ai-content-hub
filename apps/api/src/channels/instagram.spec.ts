import { UnprocessableEntityException } from '@nestjs/common';
import { InstagramPublisher } from './instagram.publisher';
import { ChannelAuthError, PermanentPublishError } from './publisher';
import { PublicMediaStore, SupabasePublicMedia } from './public-media';
import { FetchFailedError, HttpClient } from './safe-request';

const GRAPH = 'https://graph.facebook.com/v21.0';
const TOKEN = 'IGQV' + 'x'.repeat(40);
const IG = '17841400000000000';

class FakeStore implements PublicMediaStore {
  configured = true;
  uploads: { key: string; mimeType: string; size: number }[] = [];
  removed: string[] = [];
  failUpload = false;
  async upload(key: string, data: Buffer, mimeType: string) {
    if (this.failUpload) throw new Error('Public picture storage refused the upload (500)');
    this.uploads.push({ key, mimeType, size: data.length });
    return `https://files.example/public/${key}`;
  }
  async remove(key: string) {
    this.removed.push(key);
  }
}

describe('Supabase public picture storage', () => {
  const cfg = { url: 'https://proj.supabase.co/', serviceKey: 'service-key-' + 'k'.repeat(20) };

  it('is only configured with both a project address and a service key', () => {
    expect(new SupabasePublicMedia({}).configured).toBe(false);
    expect(new SupabasePublicMedia({ url: cfg.url }).configured).toBe(false);
    expect(new SupabasePublicMedia(cfg).configured).toBe(true);
  });

  it('uploads with the service key and returns the public address', async () => {
    const calls: any[] = [];
    const store = new SupabasePublicMedia({ ...cfg, bucket: 'pics' }, (async (u: any, i: any) => {
      calls.push([u, i]);
      return new Response('{}', { status: 200 });
    }) as any);
    const url = await store.upload('instagram/a.jpg', Buffer.from('jpg'), 'image/jpeg');
    expect(url).toBe('https://proj.supabase.co/storage/v1/object/public/pics/instagram/a.jpg');
    expect(calls[0][0]).toBe('https://proj.supabase.co/storage/v1/object/pics/instagram/a.jpg');
    expect(calls[0][1].method).toBe('POST');
    expect(calls[0][1].headers.Authorization).toBe(`Bearer ${cfg.serviceKey}`);
    expect(calls[0][1].headers['Content-Type']).toBe('image/jpeg');
  });

  it('reports a refused upload and never leaks the key', async () => {
    const store = new SupabasePublicMedia(
      cfg,
      (async () => new Response('no', { status: 403 })) as any,
    );
    const err = await store.upload('a.jpg', Buffer.from('x'), 'image/jpeg').catch((e) => e);
    expect(err.message).toBe('Public picture storage refused the upload (403)');
    expect(err.message).not.toContain(cfg.serviceKey);
  });

  it('refuses keys that could leave the bucket', async () => {
    const store = new SupabasePublicMedia(cfg, (async () => new Response('{}')) as any);
    await expect(store.upload('../x.jpg', Buffer.from('x'), 'image/jpeg')).rejects.toThrow(
      'Invalid storage key',
    );
    await expect(store.upload('a b.jpg', Buffer.from('x'), 'image/jpeg')).rejects.toThrow(
      'Invalid storage key',
    );
  });

  it('removes a file and never throws when that fails', async () => {
    const calls: any[] = [];
    const ok = new SupabasePublicMedia(cfg, (async (u: any, i: any) => {
      calls.push([u, i.method]);
      return new Response('{}');
    }) as any);
    await ok.remove('a.jpg');
    expect(calls[0]).toEqual([
      'https://proj.supabase.co/storage/v1/object/public-media/a.jpg',
      'DELETE',
    ]);
    const broken = new SupabasePublicMedia(cfg, (async () => {
      throw new Error('network');
    }) as any);
    await expect(broken.remove('a.jpg')).resolves.toBeUndefined();
  });
});

describe('Instagram publisher', () => {
  const make = (impl: HttpClient, store = new FakeStore()) => {
    const http = jest.fn(impl);
    return {
      http,
      store,
      ig: new InstagramPublisher(http, store, { intervalMs: 0, attempts: 3 }),
    };
  };
  const make2 = (
    impl: HttpClient,
    store = new FakeStore(),
    convert?: (b: Buffer) => Promise<Buffer>,
  ) => {
    const http = jest.fn(impl);
    return {
      http,
      store,
      ig: new InstagramPublisher(http, store, { intervalMs: 0, attempts: 3 }, convert),
    };
  };
  const ok = (json: any) => ({ status: 200, json });
  const graphErr = (status: number, code: number, message = 'Problem') => ({
    status,
    json: { error: { code, message } },
  });
  const channel = (over: Record<string, unknown> = {}) => ({
    id: 'c1',
    name: 'My Instagram',
    config: { igUserId: IG, username: 'atlas' },
    secret: { accessToken: TOKEN },
    ...over,
  });
  const payload = {
    kind: 'INSTAGRAM' as const,
    title: 'Open Day',
    text: 'Open Day on 14 March!\n\n#OpenDay',
  };
  const jpeg = (name: string, altText?: string) => ({
    filename: name,
    mimeType: 'image/jpeg',
    data: Buffer.from('img-' + name),
    altText,
  });

  /** A well-behaved Instagram: containers are ready at once, the publish succeeds. */
  const happy = (): HttpClient => {
    let n = 0;
    return async (url, opts) => {
      if (url.includes('fields=status_code')) return ok({ id: 'x', status_code: 'FINISHED' });
      if (url.endsWith('/media_publish')) return ok({ id: 'media-1' });
      if (url.includes('fields=permalink'))
        return ok({ permalink: 'https://instagram.com/p/abc/' });
      if (url.endsWith('/media')) return ok({ id: `container-${++n}` });
      throw new Error('unexpected ' + url + JSON.stringify(opts));
    };
  };

  it('only publishes Instagram posts, and is ready only with public storage', () => {
    const { ig, store } = make(async () => ok({}));
    expect(ig.supports('INSTAGRAM')).toBe(true);
    for (const k of ['ARTICLE', 'FACEBOOK', 'LINKEDIN'] as const)
      expect(ig.supports(k)).toBe(false);
    expect(ig.ready()).toBe(true);
    store.configured = false;
    expect(ig.ready()).toBe(false);
  });

  describe('connecting', () => {
    const input = { igUserId: IG, accessToken: TOKEN };

    it('verifies the account and keeps the token only as a secret', async () => {
      const { ig, http } = make(async () => ok({ id: IG, username: 'atlas' }));
      const r = await ig.prepare(input);
      expect(r.config).toEqual({ igUserId: IG, username: 'atlas' });
      expect(r.secret).toEqual({ accessToken: TOKEN });
      const [url, opts] = http.mock.calls[0];
      expect(url).toBe(`${GRAPH}/${IG}?fields=id,username`);
      expect(opts?.headers?.Authorization).toBe(`Bearer ${TOKEN}`);
      expect(String(url)).not.toContain(TOKEN);
    });

    it('rejects a malformed account id before contacting Instagram', async () => {
      const { ig, http } = make(async () => ok({}));
      await expect(ig.prepare({ igUserId: 'abc', accessToken: TOKEN })).rejects.toThrow();
      expect(http).not.toHaveBeenCalled();
    });

    it('explains a rejected token, an invisible account and an account mismatch', async () => {
      await expect(make(async () => graphErr(400, 190)).ig.prepare(input)).rejects.toThrow(
        /did not accept that access token/,
      );
      await expect(make(async () => graphErr(400, 100)).ig.prepare(input)).rejects.toThrow(
        /cannot see that Instagram account/,
      );
      await expect(
        make(async () => ok({ id: '999999', username: 'other' })).ig.prepare(input),
      ).rejects.toThrow(/does not belong to that Instagram account/);
      await expect(make(async () => graphErr(500, 1, 'boom')).ig.prepare(input)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('reports an unreachable network without raw errors', async () => {
      const { ig } = make(async () => {
        throw new FetchFailedError('The website took too long to respond');
      });
      await expect(ig.prepare(input)).rejects.toThrow(
        'Could not connect to Instagram. The website took too long to respond',
      );
    });

    it('keeps the account when reconnecting, only the token changes', () => {
      const { ig } = make(async () => ok({}));
      expect(ig.identity({ igUserId: IG })).toBe(IG);
      expect(ig.reconnectInput({ igUserId: IG }, { accessToken: 'new' })).toEqual({
        igUserId: IG,
        accessToken: 'new',
      });
    });
  });

  describe('publishing one picture', () => {
    it('uploads, creates the container, waits, publishes, then removes the public file', async () => {
      const { ig, http, store } = make(happy());
      const r = await ig.publish(channel(), payload, [jpeg('a.jpg', 'A group of students')]);
      expect(r).toEqual({ externalId: 'media-1', url: 'https://instagram.com/p/abc/' });
      expect(store.uploads).toHaveLength(1);
      expect(store.uploads[0].mimeType).toBe('image/jpeg');

      const create = http.mock.calls.find(([u]) => u === `${GRAPH}/${IG}/media`)!;
      expect(create[1]?.body).toEqual({
        image_url: `https://files.example/public/${store.uploads[0].key}`,
        caption: payload.text,
        alt_text: 'A group of students',
      });
      expect(create[1]?.headers?.Authorization).toBe(`Bearer ${TOKEN}`);
      const publish = http.mock.calls.find(([u]) => u.endsWith('/media_publish'))!;
      expect(publish[1]?.body).toEqual({ creation_id: 'container-1' });
      expect(store.removed).toEqual([store.uploads[0].key]); // not left online
      for (const [u] of http.mock.calls) expect(u).not.toContain(TOKEN);
    });

    it('waits while Instagram is still processing', async () => {
      let polls = 0;
      const base = happy();
      const { ig } = make(async (url, opts) => {
        if (url.includes('fields=status_code')) {
          return ok({ id: 'x', status_code: ++polls < 3 ? 'IN_PROGRESS' : 'FINISHED' });
        }
        return base(url, opts);
      });
      await expect(ig.publish(channel(), payload, [jpeg('a.jpg')])).resolves.toMatchObject({
        externalId: 'media-1',
      });
      expect(polls).toBe(3);
    });

    it('asks for a retry (not a failure) when processing takes too long', async () => {
      const base = happy();
      const { ig, store } = make(async (url, opts) =>
        url.includes('fields=status_code')
          ? ok({ id: 'x', status_code: 'IN_PROGRESS' })
          : base(url, opts),
      );
      const err = await ig.publish(channel(), payload, [jpeg('a.jpg')]).catch((e) => e);
      expect(err).toBeInstanceOf(Error);
      expect(err).not.toBeInstanceOf(PermanentPublishError);
      expect(err.message).toMatch(/still processing/);
      expect(store.removed).toHaveLength(1); // cleaned up even so
    });

    it('fails for good when Instagram cannot process the picture', async () => {
      const base = happy();
      const { ig, store } = make(async (url, opts) =>
        url.includes('fields=status_code')
          ? ok({ id: 'x', status_code: 'ERROR', status: 'Error: aspect ratio' })
          : base(url, opts),
      );
      const err = await ig.publish(channel(), payload, [jpeg('a.jpg')]).catch((e) => e);
      expect(err).toBeInstanceOf(PermanentPublishError);
      expect(err.message).toMatch(/could not process a picture \(Error: aspect ratio\)/);
      expect(store.removed).toHaveLength(1);
    });

    it('does not retry a publish whose outcome is unknown', async () => {
      const base = happy();
      const { ig, http, store } = make(async (url, opts) => {
        if (url.endsWith('/media_publish')) throw new FetchFailedError('Could not connect');
        return base(url, opts);
      });
      const err = await ig.publish(channel(), payload, [jpeg('a.jpg')]).catch((e) => e);
      expect(err).toBeInstanceOf(PermanentPublishError);
      expect(err.message).toMatch(/may have published the post/);
      expect(http.mock.calls.filter(([u]) => u.endsWith('/media_publish'))).toHaveLength(1);
      expect(store.removed).toHaveLength(1);
    });

    it('does not fail a published post because the link could not be read', async () => {
      const base = happy();
      const { ig } = make(async (url, opts) => {
        if (url.includes('fields=permalink')) throw new Error('boom');
        return base(url, opts);
      });
      await expect(ig.publish(channel(), payload, [jpeg('a.jpg')])).resolves.toEqual({
        externalId: 'media-1',
        url: null,
      });
    });

    it('retries a failed container creation, since nothing is public yet', async () => {
      const { ig } = make(async (url) => {
        if (url.endsWith('/media')) return { status: 503, json: null };
        return ok({});
      });
      const err = await ig.publish(channel(), payload, [jpeg('a.jpg')]).catch((e) => e);
      expect(err).not.toBeInstanceOf(PermanentPublishError);
      expect(err.message).toBe('Instagram is not available right now (503).');
    });
  });

  describe('publishing several pictures', () => {
    it('creates one child container per picture, then the carousel', async () => {
      const { ig, http, store } = make(happy());
      await ig.publish(channel(), payload, [jpeg('a.jpg', 'First'), jpeg('b.jpg'), jpeg('c.jpg')]);
      const creates = http.mock.calls.filter(([u]) => u === `${GRAPH}/${IG}/media`);
      expect(creates).toHaveLength(4);
      expect(creates[0][1]?.body).toMatchObject({ is_carousel_item: true, alt_text: 'First' });
      expect((creates[0][1]?.body as any).caption).toBeUndefined(); // the caption goes on the carousel
      expect(creates[3][1]?.body).toEqual({
        media_type: 'CAROUSEL',
        children: 'container-1,container-2,container-3',
        caption: payload.text,
      });
      const publish = http.mock.calls.find(([u]) => u.endsWith('/media_publish'))!;
      expect(publish[1]?.body).toEqual({ creation_id: 'container-4' });
      expect(store.removed.sort()).toEqual(store.uploads.map((u) => u.key).sort());
    });
  });

  describe('refusing what Instagram cannot do', () => {
    it('needs at least one picture', async () => {
      const { ig, http } = make(happy());
      await expect(ig.publish(channel(), payload, [])).rejects.toThrow(
        'Instagram posts need at least one picture.',
      );
      expect(http).not.toHaveBeenCalled();
    });

    it('converts PNG, WebP and GIF pictures to real JPEG before putting them online', async () => {
      const sharp = (await import('sharp')).default;
      const make = (fmt: 'png' | 'webp' | 'gif') =>
        sharp({
          create: {
            width: 40,
            height: 30,
            channels: 4,
            background: { r: 255, g: 0, b: 0, alpha: 0.4 },
          },
        })
          [fmt]()
          .toBuffer();
      const seen: Buffer[] = [];
      const store = new FakeStore();
      const upload = store.upload.bind(store);
      store.upload = async (key, data, mime) => {
        seen.push(data);
        expect(mime).toBe('image/jpeg');
        return upload(key, data, mime);
      };
      const { ig } = make2(happy(), store);
      await ig.publish(channel(), payload, [
        { filename: 'a.png', mimeType: 'image/png', data: await make('png'), altText: 'A' },
        { filename: 'b.webp', mimeType: 'image/webp', data: await make('webp') },
        { filename: 'c.gif', mimeType: 'image/gif', data: await make('gif') },
      ]);
      expect(seen).toHaveLength(3);
      for (const b of seen) {
        expect(b[0]).toBe(0xff); // JPEG start marker
        expect(b[1]).toBe(0xd8);
        const meta = await sharp(b).metadata();
        expect(meta.format).toBe('jpeg');
        expect([meta.width, meta.height]).toEqual([40, 30]);
      }
    });

    it('leaves a JPEG untouched', async () => {
      const convert = jest.fn(async (b: Buffer) => b);
      const { ig, store } = make2(happy(), new FakeStore(), convert);
      await ig.publish(channel(), payload, [jpeg('a.jpg')]);
      expect(convert).not.toHaveBeenCalled();
      expect(store.uploads[0].size).toBe(Buffer.from('img-a.jpg').length);
    });

    it('fails for good, naming the picture, when it cannot be converted', async () => {
      const { ig, store, http } = make2(happy(), new FakeStore());
      const err = await ig
        .publish(channel(), payload, [
          { filename: 'broken.png', mimeType: 'image/png', data: Buffer.from('not an image') },
        ])
        .catch((e) => e);
      expect(err).toBeInstanceOf(PermanentPublishError);
      expect(err.message).toMatch(/broken\.png.*could not be converted to JPEG/);
      expect(store.uploads).toHaveLength(0);
      expect(http).not.toHaveBeenCalled();
    });

    it('allows at most 10 pictures', async () => {
      const { ig } = make(happy());
      const many = Array.from({ length: 11 }, (_, i) => jpeg(`p${i}.jpg`));
      await expect(ig.publish(channel(), payload, many)).rejects.toThrow(/at most 10/);
    });

    it('needs public storage on the server', async () => {
      const store = new FakeStore();
      store.configured = false;
      const { ig } = make(happy(), store);
      await expect(ig.publish(channel(), payload, [jpeg('a.jpg')])).rejects.toThrow(
        /public picture storage/,
      );
    });

    it('needs a saved token', async () => {
      const { ig } = make(happy());
      await expect(
        ig.publish(channel({ secret: null }), payload, [jpeg('a.jpg')]),
      ).rejects.toBeInstanceOf(ChannelAuthError);
    });

    it('fails the post, with a retry, when the picture cannot be put online', async () => {
      const store = new FakeStore();
      store.failUpload = true;
      const { ig, http } = make(happy(), store);
      const err = await ig.publish(channel(), payload, [jpeg('a.jpg')]).catch((e) => e);
      expect(err.message).toMatch(/refused the upload/);
      expect(err).not.toBeInstanceOf(PermanentPublishError);
      expect(http).not.toHaveBeenCalled();
    });
  });

  describe('Instagram errors', () => {
    it('flags the channel when the token stops working', async () => {
      const { ig } = make(async () => graphErr(400, 190, 'Session expired'));
      await expect(ig.publish(channel(), payload, [jpeg('a.jpg')])).rejects.toBeInstanceOf(
        ChannelAuthError,
      );
    });

    it('treats a rate limit as retryable', async () => {
      const { ig } = make(async () => graphErr(400, 4));
      const err = await ig.publish(channel(), payload, [jpeg('a.jpg')]).catch((e) => e);
      expect(err).not.toBeInstanceOf(PermanentPublishError);
      expect(err.message).toMatch(/limiting how fast/);
    });

    it('shows Instagram’s own reason for a refused post, without markup', async () => {
      const { ig } = make(async () => graphErr(400, 9004, 'Media <b>download</b> failed'));
      await expect(ig.publish(channel(), payload, [jpeg('a.jpg')])).rejects.toThrow(
        'Instagram refused the post: Media download failed.',
      );
    });
  });
});
