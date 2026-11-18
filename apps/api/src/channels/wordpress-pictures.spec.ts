import { articleHtml } from './article-html';
import { renderPost } from './publishing-rules';
import { WordPressPublisher } from './wordpress.publisher';
import { HttpClient } from './safe-request';

const ID1 = '11111111-1111-4111-8111-111111111111';
const ID2 = '22222222-2222-4222-8222-222222222222';
const ID3 = '33333333-3333-4333-8333-333333333333';
const site = 'https://site.example';

const content = {
  h1: 'Open Day',
  slug: 'open-day',
  excerpt: 'x',
  seoTitle: 'Open Day at Atlas',
  metaDescription: 'm',
  introduction: `Welcome.\n\n![Students on the Rabat campus](media:${ID1} "Photo: Jane Doe · CC BY 4.0 · flickr")\n\nMore text.`,
  sections: [
    {
      heading: 'Labs',
      body: `![A chemistry lab](media:${ID2})\n\nThe labs are open.\n\n![Lost picture](media:${ID3} "Credit")`,
    },
  ],
  conclusion: 'Bye.',
  faq: [],
};

describe('pictures inside an article', () => {
  it('become figures with the description, a caption for the credit, and lazy loading', () => {
    const html = articleHtml(content, 'en');
    expect(html).toContain(
      `<figure><img src="media:${ID1}" alt="Students on the Rabat campus" loading="lazy" decoding="async"><figcaption>Photo: Jane Doe · CC BY 4.0 · flickr</figcaption></figure>`,
    );
    expect(html).toContain(
      `<figure><img src="media:${ID2}" alt="A chemistry lab" loading="lazy" decoding="async"></figure>`,
    );
    expect(html).toContain('<p>Welcome.</p>');
    expect(html).not.toContain('![');
  });

  it('cannot carry markup out of the description or the caption', () => {
    const html = articleHtml(
      {
        introduction: `![x" onerror="alert(1)](media:${ID1} "<b>Hi</b>")`,
      },
      'en',
    );
    expect(html).not.toMatch(/onerror="/);
    expect(html).toContain('&lt;b&gt;Hi&lt;/b&gt;');
  });

  it('are dropped from the plain text of the post', () => {
    const post = renderPost('ARTICLE' as any, 'Open Day', content, 'en');
    expect(post.text).not.toContain('media:');
    expect(post.text).not.toContain('Jane Doe');
    expect(post.html).toContain(`src="media:${ID1}"`);
  });

  it('are ignored when they are not on a line of their own', () => {
    const html = articleHtml(
      { introduction: `A sentence ![x](media:${ID1}) with a picture in it.` },
      'en',
    );
    expect(html).toBe('<p>A sentence  with a picture in it.</p>');
  });
});

describe('WordPress places the pictures of the text', () => {
  const picture = (assetId: string, over: Record<string, unknown> = {}) => ({
    assetId,
    filename: `${assetId.slice(0, 4)}.webp`,
    mimeType: 'image/webp',
    data: Buffer.from('WEBP-' + assetId),
    altText: 'A description',
    width: 1600,
    height: 900,
    ...over,
  });
  const channel = {
    id: 'c1',
    name: 'Site',
    config: { siteUrl: site, publishAs: 'publish' },
    secret: { username: 'editor', applicationPassword: 'abcd efgh ijkl mnop' },
  };
  const payload = () => {
    const p = renderPost('ARTICLE' as any, 'Open Day', content, 'en');
    return { ...p, slug: 'open-day' };
  };
  const make = (impl?: HttpClient) => {
    let uploads = 0;
    const posted: any[] = [];
    const http = jest.fn(
      impl ??
        (async (url: string, o: any) => {
          if (String(url).includes('/wp/v2/media/')) return { status: 200, json: { id: 1 } };
          if (String(url).endsWith('/wp/v2/media')) {
            uploads++;
            return {
              status: 201,
              json: {
                id: 100 + uploads,
                source_url: `${site}/wp-content/uploads/pic-${uploads}.webp`,
              },
            };
          }
          if (o?.method === 'POST') {
            posted.push(o.body);
            return { status: 201, json: { id: 42, link: `${site}/open-day/` } };
          }
          return { status: 200, json: [] };
        }),
    );
    return { http, wp: new WordPressPublisher(http as any), posted };
  };

  it('uploads each picture once and points the page at the site’s own copy, with its size', async () => {
    const { wp, http, posted } = make();
    await wp.publish(channel as any, payload(), [], [picture(ID1), picture(ID2)]);
    const uploads = http.mock.calls.filter(
      ([u, o]: any) => String(u).endsWith('/wp/v2/media') && o?.method === 'POST',
    );
    expect(uploads).toHaveLength(2);
    const html: string = posted[0].content;
    expect(html).toContain(
      `<img src="${site}/wp-content/uploads/pic-1.webp" width="1600" height="900" alt="Students on the Rabat campus"`,
    );
    expect(html).toContain(
      `<img src="${site}/wp-content/uploads/pic-2.webp" width="1600" height="900" alt="A chemistry lab"`,
    );
    expect(html).not.toContain('media:' + ID1);
    expect(html).not.toContain('media:' + ID2);
    // the credit stays with the picture
    expect(html).toContain('<figcaption>Photo: Jane Doe · CC BY 4.0 · flickr</figcaption>');
  });

  it('removes a picture that could not be found, with its caption, instead of leaving a broken image', async () => {
    const { wp, posted } = make();
    await wp.publish(channel as any, payload(), [], [picture(ID1), picture(ID2)]); // ID3 is missing
    const html: string = posted[0].content;
    expect(html).not.toContain(ID3);
    expect(html).not.toContain('Lost picture');
    expect(html).not.toContain('>Credit<');
    expect(html).toContain('<p>The labs are open.</p>'); // the text around it stays
  });

  it('uses the featured image and the pictures of the text together', async () => {
    const { wp, http, posted } = make();
    await wp.publish(
      channel as any,
      payload(),
      [picture(ID3, { filename: 'featured.webp' })],
      [picture(ID1)],
    );
    const names = http.mock.calls
      .filter(([u]: any) => String(u).endsWith('/wp/v2/media'))
      .map(([, o]: any) => o.headers['Content-Disposition']);
    expect(names[0]).toBe('attachment; filename="featured.webp"');
    expect(names).toHaveLength(2);
    expect(posted[0].featured_media).toBe(101);
  });

  it('leaves the page without sizes when the size is unknown, and does nothing for an article without pictures', async () => {
    const a = make();
    await a.wp.publish(
      channel as any,
      payload(),
      [],
      [picture(ID1, { width: undefined, height: undefined })],
    );
    expect(a.posted[0].content).toMatch(
      new RegExp(`<img src="${site}/wp-content/uploads/pic-1.webp" alt=`),
    );
    const b = make();
    await b.wp.publish(channel as any, { ...payload(), html: '<p>No pictures</p>' }, [], []);
    expect(b.posted[0].content).toBe('<p>No pictures</p>');
    expect(b.http.mock.calls.some(([u]: any) => String(u).endsWith('/wp/v2/media'))).toBe(false);
  });

  it('asks for a retry, and posts nothing, when a picture upload is not confirmed', async () => {
    const posted: any[] = [];
    const { wp } = make(async (url: string, o: any) => {
      if (String(url).endsWith('/wp/v2/media')) return { status: 201, json: { id: 7 } }; // no source_url
      if (o?.method === 'POST') {
        posted.push(o.body);
        return { status: 201, json: { id: 42 } };
      }
      return { status: 200, json: [] };
    });
    const err = await wp.publish(channel as any, payload(), [], [picture(ID1)]).catch((e) => e);
    expect(err.message).toBe('WordPress did not confirm the picture upload.');
    expect(posted.filter((b) => b.content)).toHaveLength(0); // no post was created
  });

  it('is not tricked by an address with special characters', async () => {
    const { wp, posted } = make(async (url: string, o: any) => {
      if (String(url).includes('/wp/v2/media/')) return { status: 200, json: { id: 1 } };
      if (String(url).endsWith('/wp/v2/media')) {
        return { status: 201, json: { id: 5, source_url: `${site}/a.webp?x="><script>&y=1` } };
      }
      if (o?.method === 'POST') {
        posted.push(o.body);
        return { status: 201, json: { id: 42 } };
      }
      return { status: 200, json: [] };
    });
    await wp.publish(channel as any, payload(), [], [picture(ID1), picture(ID2)]);
    const html: string = posted[0].content;
    expect(html).not.toContain('"><script>');
    expect(html).toContain('&quot;&gt;');
  });
});
