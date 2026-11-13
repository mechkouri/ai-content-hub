import { UnprocessableEntityException } from '@nestjs/common';
import { LinkedInPublisher, toLittleText } from './linkedin.publisher';
import { ChannelAuthError, PermanentPublishError } from './publisher';
import { FetchFailedError, HttpClient } from './safe-request';

const API = 'https://api.linkedin.com';
const TOKEN = 'AQV' + 'x'.repeat(60);

describe('LinkedIn text format', () => {
  it('escapes every reserved character so text is not cut off', () => {
    expect(toLittleText('Join us (free) at C_3 | [Rabat] <now> *today* ~ @all {x} \\ ok')).toBe(
      'Join us \\(free\\) at C\\_3 \\| \\[Rabat\\] \\<now\\> \\*today\\* \\~ \\@all \\{x\\} \\\\ ok',
    );
  });

  it('leaves ordinary punctuation and Arabic and French text alone', () => {
    expect(toLittleText("It's 14 mars, à 10 h. Réservez: oui!")).toBe(
      "It's 14 mars, à 10 h. Réservez: oui!",
    );
    expect(toLittleText('انضموا إلينا في 14 مارس')).toBe('انضموا إلينا في 14 مارس');
  });

  it('turns hashtags into LinkedIn hashtag templates', () => {
    expect(toLittleText('Open Day!\n\n#OpenDay #Atlas_University #يوم_مفتوح')).toBe(
      'Open Day!\n\n{hashtag|\\#|OpenDay} {hashtag|\\#|Atlas\\_University} {hashtag|\\#|يوم\\_مفتوح}',
    );
    // A # that is not a hashtag is escaped like any reserved character.
    expect(toLittleText('Room C#4 is open')).toBe('Room C\\#4 is open');
    expect(toLittleText('# alone')).toBe('\\# alone');
  });
});

describe('LinkedIn publisher', () => {
  const make = (impl: HttpClient) => {
    const http = jest.fn(impl);
    return { http, li: new LinkedInPublisher(http) };
  };
  const channel = (over: Record<string, unknown> = {}) => ({
    id: 'c1',
    name: 'Me',
    config: { authorUrn: 'urn:li:person:abc123', memberName: 'Said' },
    secret: { accessToken: TOKEN },
    ...over,
  });
  const payload = {
    kind: 'LINKEDIN' as const,
    title: 'Open Day',
    text: 'Open Day on 14 March (free)!\n\n#OpenDay',
  };
  const photo = (name: string) => ({
    filename: name,
    mimeType: 'image/png',
    data: Buffer.from('img-' + name),
  });
  const created = (id = 'urn:li:share:123') => ({
    status: 201,
    json: null,
    headers: { 'x-restli-id': id },
  });

  it('only publishes LinkedIn posts', () => {
    const { li } = make(async () => created());
    expect(li.supports('LINKEDIN')).toBe(true);
    for (const k of ['ARTICLE', 'INSTAGRAM', 'FACEBOOK'] as const)
      expect(li.supports(k)).toBe(false);
  });

  describe('connecting', () => {
    it('reads the profile and makes it the post author', async () => {
      const { li, http } = make(async () => ({
        status: 200,
        json: { sub: 'abc123', name: 'Said M' },
      }));
      const r = await li.prepare({ accessToken: TOKEN });
      expect(r.config).toEqual({ authorUrn: 'urn:li:person:abc123', memberName: 'Said M' });
      expect(r.secret).toEqual({ accessToken: TOKEN });
      expect(http.mock.calls[0][0]).toBe(`${API}/v2/userinfo`);
      expect(http.mock.calls[0][1]?.headers?.Authorization).toBe(`Bearer ${TOKEN}`);
    });

    const rejects = async (
      impl: HttpClient,
      message: RegExp,
      body: Record<string, unknown> = { accessToken: TOKEN },
    ) => {
      const { li } = make(impl);
      await expect(li.prepare(body)).rejects.toThrow(UnprocessableEntityException);
      await expect(li.prepare(body)).rejects.toThrow(message);
    };

    it('explains each way connecting can fail', async () => {
      await rejects(async () => ({ status: 401, json: null }), /did not accept that access token/);
      await rejects(async () => ({ status: 403, json: null }), /w_member_social/);
      await rejects(async () => ({ status: 200, json: {} }), /answered with an error/);
      await rejects(async () => ({ status: 500, json: null }), /error \(500\)/);
      await rejects(async () => {
        throw new FetchFailedError('The website took too long to respond');
      }, /took too long/);
    });

    it('validates the token before contacting LinkedIn', async () => {
      const { li, http } = make(async () => ({ status: 200, json: {} }));
      await expect(li.prepare({ accessToken: 'short' })).rejects.toThrow();
      await expect(li.prepare({})).rejects.toThrow();
      expect(http).not.toHaveBeenCalled();
    });
  });

  describe('publishing', () => {
    it('posts text with the version headers, escaped text and hashtag template', async () => {
      const { li, http } = make(async () => created('urn:li:share:555'));
      const r = await li.publish(channel(), payload, []);
      expect(r).toEqual({
        externalId: 'urn:li:share:555',
        url: 'https://www.linkedin.com/feed/update/urn%3Ali%3Ashare%3A555/',
      });
      const [url, opts] = http.mock.calls[0];
      expect(url).toBe(`${API}/rest/posts`);
      expect(opts?.method).toBe('POST');
      expect(opts?.headers).toMatchObject({
        Authorization: `Bearer ${TOKEN}`,
        'X-Restli-Protocol-Version': '2.0.0',
        'LinkedIn-Version': expect.stringMatching(/^\d{6}$/),
      });
      expect(opts?.body).toMatchObject({
        author: 'urn:li:person:abc123',
        commentary: 'Open Day on 14 March \\(free\\)!\n\n{hashtag|\\#|OpenDay}',
        visibility: 'PUBLIC',
        lifecycleState: 'PUBLISHED',
        distribution: { feedDistribution: 'MAIN_FEED' },
      });
      expect((opts?.body as any).content).toBeUndefined();
    });

    it('uploads one picture, then references it in the post', async () => {
      const { li, http } = make(async (url, o) => {
        if (String(url).includes('initializeUpload')) {
          return {
            status: 200,
            json: {
              value: {
                uploadUrl: 'https://uploads.linkedin.example/up/1',
                image: 'urn:li:image:A1',
              },
            },
          };
        }
        if (o?.method === 'PUT') return { status: 201, json: null };
        return created();
      });
      await li.publish(channel(), payload, [photo('a.png')]);
      const calls = http.mock.calls;
      expect(calls).toHaveLength(3);
      expect(calls[0][1]?.body).toEqual({
        initializeUploadRequest: { owner: 'urn:li:person:abc123' },
      });
      expect(calls[1][0]).toBe('https://uploads.linkedin.example/up/1');
      expect(calls[1][1]?.method).toBe('PUT');
      expect(calls[1][1]?.raw?.data.toString()).toBe('img-a.png');
      expect(calls[1][1]?.raw?.contentType).toBe('image/png');
      expect(calls[1][1]?.headers).toEqual({ Authorization: `Bearer ${TOKEN}` }); // no extra headers to the upload host
      expect((calls[2][1]?.body as any).content).toEqual({ media: { id: 'urn:li:image:A1' } });
    });

    it('posts several pictures as a multi-image post', async () => {
      let n = 0;
      const { li, http } = make(async (url, o) => {
        if (String(url).includes('initializeUpload')) {
          n++;
          return {
            status: 200,
            json: {
              value: {
                uploadUrl: `https://uploads.linkedin.example/up/${n}`,
                image: `urn:li:image:I${n}`,
              },
            },
          };
        }
        if (o?.method === 'PUT') return { status: 201, json: null };
        return created();
      });
      await li.publish(channel(), payload, [photo('a.png'), photo('b.png'), photo('c.png')]);
      const post = http.mock.calls[http.mock.calls.length - 1][1]?.body as any;
      expect(post.content).toEqual({
        multiImage: {
          images: [{ id: 'urn:li:image:I1' }, { id: 'urn:li:image:I2' }, { id: 'urn:li:image:I3' }],
        },
      });
    });

    it('sends picture descriptions with single and multi-image posts, and leaves them out when there are none', async () => {
      let n = 0;
      const upload = async (url: any, o: any) => {
        if (String(url).includes('initializeUpload')) {
          n++;
          return {
            status: 200,
            json: {
              value: {
                uploadUrl: `https://uploads.linkedin.example/${n}`,
                image: `urn:li:image:I${n}`,
              },
            },
          };
        }
        if (o?.method === 'PUT') return { status: 201, json: null };
        return created();
      };
      const one = make(upload);
      await one.li.publish(channel(), payload, [
        { ...photo('a.png'), altText: 'A crowd at the open day' },
      ]);
      expect((one.http.mock.calls[2][1]?.body as any).content).toEqual({
        media: { id: 'urn:li:image:I1', altText: 'A crowd at the open day' },
      });

      n = 0;
      const many = make(upload);
      await many.li.publish(channel(), payload, [
        { ...photo('a.png'), altText: 'First' },
        photo('b.png'),
      ]);
      const post = many.http.mock.calls[many.http.mock.calls.length - 1][1]?.body as any;
      expect(post.content.multiImage.images).toEqual([
        { id: 'urn:li:image:I1', altText: 'First' },
        { id: 'urn:li:image:I2' },
      ]);
    });

    it('treats a rejected token or permission as permanent so the channel is flagged', async () => {
      for (const status of [401, 403]) {
        const { li } = make(async () => ({ status, json: { message: 'Expired' } }));
        await expect(li.publish(channel(), payload, [])).rejects.toThrow(ChannelAuthError);
      }
      const { li } = make(async () => created());
      await expect(li.publish(channel({ secret: null }), payload, [])).rejects.toThrow(
        ChannelAuthError,
      );
      await expect(li.publish(channel({ config: {} }), payload, [])).rejects.toThrow(
        ChannelAuthError,
      );
    });

    it('retries rate limits and never retries a refused post', async () => {
      const limited = make(async () => ({ status: 429, json: null }));
      const e = await limited.li.publish(channel(), payload, []).catch((x) => x);
      expect(e).not.toBeInstanceOf(PermanentPublishError);
      expect(e.message).toMatch(/limiting/);

      const refused = make(async () => ({
        status: 422,
        json: { message: 'Duplicate <b>content</b>' },
      }));
      const e2 = await refused.li.publish(channel(), payload, []).catch((x) => x);
      expect(e2).toBeInstanceOf(PermanentPublishError);
      expect(e2.message).toBe('LinkedIn refused the post: Duplicate content.');

      const sunset = make(async () => ({ status: 426, json: null }));
      await expect(sunset.li.publish(channel(), payload, [])).rejects.toThrow(
        /LINKEDIN_API_VERSION/,
      );
    });

    it('never retries a lost answer from the request that publishes, to avoid posting twice', async () => {
      const lost = make(async () => {
        throw new FetchFailedError('The website took too long to respond');
      });
      const e = await lost.li.publish(channel(), payload, []).catch((x) => x);
      expect(e).toBeInstanceOf(PermanentPublishError);
      expect(e.message).toMatch(/check your profile/i);

      const server = make(async () => ({ status: 500, json: null }));
      await expect(server.li.publish(channel(), payload, [])).rejects.toThrow(/did not confirm/);

      const noId = make(async () => ({ status: 201, json: {}, headers: {} }));
      await expect(noId.li.publish(channel(), payload, [])).rejects.toThrow(PermanentPublishError);
    });

    it('does retry picture uploads that fail, because nothing is public yet', async () => {
      const { li, http } = make(async () => ({ status: 503, json: null }));
      const e = await li.publish(channel(), payload, [photo('a.png')]).catch((x) => x);
      expect(e).not.toBeInstanceOf(PermanentPublishError);
      expect(http).toHaveBeenCalledTimes(1);

      const noUrl = make(async () => ({ status: 200, json: { value: {} } }));
      const e2 = await noUrl.li.publish(channel(), payload, [photo('a.png')]).catch((x) => x);
      expect(e2).not.toBeInstanceOf(PermanentPublishError);
      expect(e2.message).toMatch(/upload address/);
    });
  });
});
