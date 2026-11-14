import { seoChecks, seoScore } from './content-guard';
import { ArticleContent } from './content-schemas';

const para = (n: number, word = 'word') => Array.from({ length: n }, () => word).join(' ');
const sentence = (n: number) => `${para(n)}.`;

const article = (over: Partial<ArticleContent> = {}): ArticleContent => ({
  seoTitle: 'Open Day at Atlas University in Rabat: programs and tours',
  metaDescription:
    'Join the Open Day at Atlas University in Rabat on 14 March: tour the labs, meet teachers and discover every program.',
  slug: 'open-day-atlas-university-rabat',
  h1: 'Open Day at Atlas University in Rabat',
  excerpt: 'Everything you need to know.',
  introduction: 'The open day lets future students visit the campus. Teachers answer questions.',
  sections: [
    { heading: 'Why visit the open day', body: 'You see the labs. You meet the teachers.' },
    { heading: 'How to register', body: 'Registration is free. Use the website.' },
  ],
  conclusion: 'Plan ahead and secure your spot.',
  faq: [{ question: 'Is it free?', answer: 'Yes, it is free.' }],
  internalLinkSuggestions: [
    { anchorText: 'programs', suggestedTopic: 'Program list' },
    { anchorText: 'campus', suggestedTopic: 'Campus map' },
  ],
  featuredImageBrief: 'Campus',
  imageAltText: 'Students on campus',
  structuredData: { type: 'Article' },
  ...over,
});

const byId = (a: ArticleContent, kw?: string) =>
  Object.fromEntries(
    seoChecks(a, { primaryKeyword: kw, length: 'short' }).map((c) => [c.id, c] as const),
  );

describe('keyword use', () => {
  it('wants the keyword in at least one subheading', () => {
    expect(byId(article(), 'open day')['keyword-subheading'].ok).toBe(true); // "Why visit the open day"
    expect(byId(article(), 'tuition')['keyword-subheading'].ok).toBe(false);
  });

  it('measures how much of the text is the keyword, and calls over-use stuffing', () => {
    const ok = byId(
      article({ introduction: `${para(80)} open day ${para(40)}`, conclusion: para(30) }),
      'open day',
    )['keyword-density'];
    expect(ok.ok).toBe(true);
    expect(ok.params!.count).toBeGreaterThanOrEqual(1);

    const stuffed = byId(
      article({ introduction: Array.from({ length: 12 }, () => 'open day tips').join(' ') }),
      'open day',
    )['keyword-density'];
    expect(stuffed.ok).toBe(false);
    expect(Number(stuffed.params!.density)).toBeGreaterThan(2.5);

    const missing = byId(article({ introduction: para(100) }), 'tuition')['keyword-density'];
    expect(missing.ok).toBe(false);
    expect(missing.params).toEqual({ density: 0, count: 0 });
  });

  it('has no keyword checks without a keyword', () => {
    expect(Object.keys(byId(article())).some((id) => id.startsWith('keyword'))).toBe(false);
  });

  it('counts the keyword whatever its case', () => {
    const c = byId(article({ introduction: `${para(60)} OPEN DAY ${para(60)}` }), 'Open Day')[
      'keyword-density'
    ];
    expect(c.params!.count).toBeGreaterThanOrEqual(1);
  });
});

describe('readability', () => {
  it('accepts short sentences and flags a wall of long ones', () => {
    expect(byId(article())['sentence-length'].ok).toBe(true);
    const long = byId(
      article({
        introduction: `${sentence(40)} ${sentence(45)} ${sentence(50)}`,
        conclusion: sentence(60),
      }),
    )['sentence-length'];
    expect(long.ok).toBe(false);
    expect(Number(long.params!.avg)).toBeGreaterThan(22);
    expect(long.params!.long).toBeGreaterThanOrEqual(3);
  });

  it('splits Arabic sentences on the Arabic question mark', () => {
    const arabic = byId(
      article({
        introduction: 'هل التسجيل مجاني؟ نعم هو مجاني. يمكنكم زيارة الحرم الجامعي.',
        conclusion: 'نراكم قريبا.',
      }),
    )['sentence-length'];
    expect(arabic.ok).toBe(true);
    expect(Number(arabic.params!.avg)).toBeLessThan(6);
  });

  it('flags a paragraph that is too long, and accepts a long text split into paragraphs', () => {
    const block = byId(article({ introduction: para(200) }))['paragraph-length'];
    expect(block.ok).toBe(false);
    expect(block.params!.n).toBe(200);
    const split = byId(article({ introduction: `${para(100)}\n\n${para(100)}` }))[
      'paragraph-length'
    ];
    expect(split.ok).toBe(true);
  });
});

describe('headings, links and address', () => {
  it('flags headings that are too long or repeated', () => {
    expect(byId(article())['heading-length'].ok).toBe(true);
    expect(byId(article())['heading-unique'].ok).toBe(true);
    const long = byId(
      article({
        sections: [
          { heading: 'x'.repeat(80), body: 'Text here.' },
          { heading: 'B', body: 'T' },
        ],
      }),
    );
    expect(long['heading-length'].ok).toBe(false);
    expect(long['heading-length'].params).toEqual({ n: 1 });
    const dup = byId(
      article({
        sections: [
          { heading: 'How to register', body: 'Text here.' },
          { heading: ' how to REGISTER ', body: 'More text.' },
        ],
      }),
    );
    expect(dup['heading-unique'].ok).toBe(false);
    expect(dup['heading-unique'].params).toEqual({ n: 1 });
  });

  it('wants at least two internal link ideas', () => {
    expect(byId(article())['internal-links'].ok).toBe(true);
    const one = byId(
      article({ internalLinkSuggestions: [{ anchorText: 'a', suggestedTopic: 'b' }] }),
    );
    expect(one['internal-links'].ok).toBe(false);
    expect(byId(article({ internalLinkSuggestions: [] }))['internal-links'].params).toEqual({
      n: 0,
    });
  });

  it('wants a short slug and a real structured data type', () => {
    expect(byId(article())['slug-length'].ok).toBe(true);
    expect(byId(article({ slug: 'a'.repeat(76) }))['slug-length'].ok).toBe(false);
    expect(byId(article({ slug: '' }))['slug-length'].ok).toBe(false);
    expect(byId(article({ structuredData: { type: 'Other' } }))['structured-data'].ok).toBe(false);
    expect(byId(article({ structuredData: { type: 'FAQPage' } }))['structured-data'].ok).toBe(true);
  });
});

describe('messages carry the numbers a translation needs', () => {
  it('gives every check an id, a message and, where it mentions a number, its params', () => {
    const checks = seoChecks(article(), { primaryKeyword: 'open day', length: 'short' });
    const ids = checks.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length); // no id twice
    for (const c of checks) {
      expect(c.message.length).toBeGreaterThan(5);
      // every number in a message appears in its params
      // "H1", "H2" and "H3" are heading names, not quantities.
      if (['keyword-h1', 'keyword-subheading'].includes(c.id)) continue;
      for (const num of c.message.match(/[0-9]+([.][0-9]+)?/g) ?? []) {
        if (['30', '60', '70', '160', '2', '75', '22', '35', '0.4', '2.5'].includes(num)) continue; // fixed advice
        const values = Object.values(c.params ?? {}).map(String);
        expect({ id: c.id, num, found: values.includes(num) }).toEqual({
          id: c.id,
          num,
          found: true,
        });
      }
    }
    expect(checks.find((c) => c.id === 'title-length')!.params).toEqual({
      n: article().seoTitle.length,
    });
  });
});

describe('score', () => {
  it('is the share of checks that pass', () => {
    const good = seoChecks(article({ introduction: `${para(60)} open day ${para(60)}` }), {
      primaryKeyword: 'open day',
      length: 'short',
    });
    expect(seoScore(good)).toBe(Math.round((good.filter((c) => c.ok).length / good.length) * 100));
    expect(seoScore([])).toBe(0);
    expect(seoScore([{ id: 'a', ok: true, message: 'x' }])).toBe(100);
    expect(
      seoScore([
        { id: 'a', ok: true, message: 'x' },
        { id: 'b', ok: false, message: 'y' },
        { id: 'c', ok: false, message: 'z' },
      ]),
    ).toBe(33);
  });

  it('is lower for a weak article than for a good one', () => {
    const weak = article({
      seoTitle: 'Hi',
      metaDescription: 'Short',
      sections: [{ heading: 'One', body: para(300) }],
      faq: [],
      internalLinkSuggestions: [],
      imageAltText: '',
      structuredData: { type: 'Other' },
    });
    const good = article();
    const s = (a: ArticleContent) => seoScore(seoChecks(a, { length: 'short' }));
    expect(s(weak)).toBeLessThan(s(good));
  });
});

// The structured data helper lives with the web app (pure code, no React); it is tested here with the API suite.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const seoSchema = require('../../../web/src/lib/seo-schema') as {
  articleJsonLd: (a: any, ctx: { siteName: string; language: string }) => Record<string, any>[];
  jsonLdScripts: (o: Record<string, any>[]) => string;
};

describe('structured data (JSON-LD)', () => {
  const ctx = { siteName: 'Atlas University', language: 'en' };

  it('describes the article and its FAQ', () => {
    const [art, faq] = seoSchema.articleJsonLd(article(), ctx);
    expect(art).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: 'Open Day at Atlas University in Rabat',
      inLanguage: 'en',
      articleSection: ['Why visit the open day', 'How to register'],
      author: { '@type': 'Organization', name: 'Atlas University' },
      publisher: { '@type': 'Organization', name: 'Atlas University' },
    });
    expect(art.datePublished).toBeUndefined(); // unknown until it goes live
    expect(faq).toEqual({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'Is it free?',
          acceptedAnswer: { '@type': 'Answer', text: 'Yes, it is free.' },
        },
      ],
    });
  });

  it('uses NewsArticle when chosen, and leaves out what it does not know', () => {
    const out = seoSchema.articleJsonLd(
      article({ structuredData: { type: 'NewsArticle' }, faq: [], sections: [] }),
      { siteName: '  ', language: 'ar' },
    );
    expect(out).toHaveLength(1); // no FAQ, so no FAQPage
    expect(out[0]['@type']).toBe('NewsArticle');
    expect(out[0].author).toBeUndefined();
    expect(out[0].articleSection).toBeUndefined();
    expect(out[0].inLanguage).toBe('ar');
  });

  it('cuts the headline at 110 characters and skips empty FAQ items', () => {
    const out = seoSchema.articleJsonLd(
      article({
        h1: 'x'.repeat(200),
        faq: [
          { question: '', answer: 'A' },
          { question: 'Q', answer: '  ' },
        ],
      }),
      ctx,
    );
    expect(out[0].headline).toHaveLength(110);
    expect(out).toHaveLength(1);
  });

  it('prints script tags that cannot be broken out of', () => {
    const text = seoSchema.jsonLdScripts(
      seoSchema.articleJsonLd(article({ h1: 'A </script><b>x</b> trick' }), ctx),
    );
    expect(text.match(/<script type="application\/ld\+json">/g)).toHaveLength(2);
    expect(text.match(/<\/script>/g)).toHaveLength(2); // only the two real closing tags
    const first = text.split('\n').slice(1, text.split('\n').indexOf('</script>')).join('\n');
    // read back, the escaped closing tag is the original text and the whole thing is valid JSON
    expect(JSON.parse(first.split('<\\/').join('</'))['@type']).toBe('Article');
  });
});
