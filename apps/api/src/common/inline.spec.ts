import { articleHtml } from '../channels/article-html';
import { renderPost } from '../channels/publishing-rules';
import { findUnsupportedClaims, seoChecks } from '../studio/content-guard';
import { articleWordCount } from '../studio/content-schemas';
import { inlineToHtml, stripInline } from './inline';

describe('inline formatting to HTML', () => {
  it('turns bold, italic and links into tags', () => {
    expect(inlineToHtml('A **bold** and *italic* word')).toBe(
      'A <strong>bold</strong> and <em>italic</em> word',
    );
    expect(inlineToHtml('See [our site](https://atlas.example/open-day) now')).toBe(
      'See <a href="https://atlas.example/open-day" rel="noopener">our site</a> now',
    );
    expect(inlineToHtml('[**bold link**](http://a.example)')).toBe(
      '<a href="http://a.example" rel="noopener"><strong>bold link</strong></a>',
    );
    expect(inlineToHtml('**one** and **two**')).toBe(
      '<strong>one</strong> and <strong>two</strong>',
    );
  });

  it('works with Arabic and French text', () => {
    expect(inlineToHtml('سجّل **الآن** عبر [الموقع](https://atlas.example)')).toBe(
      'سجّل <strong>الآن</strong> عبر <a href="https://atlas.example" rel="noopener">الموقع</a>',
    );
    expect(inlineToHtml('L’*Open Day* à Rabat')).toBe('L’<em>Open Day</em> à Rabat');
  });

  it('never lets markup through, in the text, in link text or in the address', () => {
    expect(inlineToHtml('<script>alert(1)</script> **x**')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt; <strong>x</strong>',
    );
    expect(inlineToHtml('[<img src=x onerror=alert(1)>](https://a.example)')).toBe(
      '<a href="https://a.example" rel="noopener">&lt;img src=x onerror=alert(1)&gt;</a>',
    );
    // an address cannot break out of its attribute, and javascript: is not a link at all
    expect(inlineToHtml('[x](https://a.example/"onmouseover="alert(1))')).not.toContain(
      'onmouseover="',
    );
    expect(inlineToHtml('[click](javascript:alert(1))')).toBe('[click](javascript:alert(1))');
    expect(inlineToHtml('[click](data:text/html,hi)')).toBe('[click](data:text/html,hi)');
    expect(inlineToHtml('[x](https://a.example/?a=1&b=2)')).toContain(
      'href="https://a.example/?a=1&amp;b=2"',
    );
  });

  it('leaves everything else exactly as typed', () => {
    for (const text of [
      'Price 2*3*4 is 24',
      'a * b and c * d',
      'An unclosed **bold',
      'A lone * star',
      'snake_case and under_scores',
      '[not a link] (https://a.example)',
      '[empty]()',
    ]) {
      expect(inlineToHtml(text)).toBe(text.replace(/&/g, '&amp;'));
    }
  });

  it('does not run away on hostile input', () => {
    const start = Date.now();
    inlineToHtml('*'.repeat(50_000));
    inlineToHtml('['.repeat(20_000) + '](https://a.example)');
    inlineToHtml('**' + 'a '.repeat(30_000));
    expect(Date.now() - start).toBeLessThan(1500);
  });
});

describe('inline formatting stripped', () => {
  it('keeps the words, drops the marks and the link address', () => {
    expect(stripInline('A **bold** and *italic* [link text](https://a.example/x?y=1) end')).toBe(
      'A bold and italic link text end',
    );
    expect(stripInline('plain text')).toBe('plain text');
    expect(stripInline('2*3*4')).toBe('2*3*4');
  });
});

describe('article text with formatting', () => {
  const content = {
    introduction:
      'Visit **Atlas** at [the campus](https://atlas.example/campus).\n\nSecond *paragraph*.',
    sections: [{ heading: 'Why come', body: 'Because of the **labs**.' }],
    conclusion: 'See you soon.',
    faq: [{ question: 'Free?', answer: 'Yes, [register](https://atlas.example/register).' }],
    slug: 'open-day',
    h1: 'Open day',
    seoTitle: 'Open day at Atlas University',
    metaDescription: 'Come to the open day.',
    structuredData: { type: 'Article' },
    internalLinkSuggestions: [],
    imageAltText: 'a',
    featuredImageBrief: 'b',
    excerpt: 'x',
  };

  it('becomes website HTML with real tags, one paragraph per block', () => {
    const html = articleHtml(content, 'en');
    expect(html).toContain(
      '<p>Visit <strong>Atlas</strong> at <a href="https://atlas.example/campus" rel="noopener">the campus</a>.</p>',
    );
    expect(html).toContain('<p>Second <em>paragraph</em>.</p>');
    expect(html).toContain('<p>Because of the <strong>labs</strong>.</p>');
    expect(html).toContain(
      '<h3>Free?</h3>\n<p>Yes, <a href="https://atlas.example/register" rel="noopener">register</a>.</p>',
    );
  });

  it('keeps the formatting out of the plain text that limits and the audit trail use', () => {
    const post = renderPost('ARTICLE' as any, 'Open day', content, 'en');
    expect(post.text).toContain('Visit Atlas at the campus.');
    expect(post.text).not.toMatch(/\*|\]\(/);
    expect(post.html).toContain('<strong>Atlas</strong>');
  });

  it('is counted by the words people read', () => {
    const base = { ...content, faq: [] } as any;
    const plain = {
      ...base,
      introduction: 'Visit Atlas at the campus.\n\nSecond paragraph.',
      sections: [{ heading: 'Why come', body: 'Because of the labs.' }],
    };
    expect(articleWordCount(base)).toBe(articleWordCount(plain));
  });

  it('does not make keyword or readability checks see the marks', () => {
    const a: any = {
      ...content,
      introduction: 'The **open day** is great. A [guide](https://atlas.example/guide) helps.',
      sections: [{ heading: 'The open day', body: 'It is *fun*. Come along.' }],
    };
    const checks = Object.fromEntries(
      seoChecks(a, { primaryKeyword: 'open day', length: 'short' }).map((c) => [c.id, c]),
    );
    // "open day" counts as a keyword use even though it is bold
    expect(checks['keyword-density'].params!.count).toBeGreaterThanOrEqual(1);
    // the link address is not read as words: sentences stay short
    expect(Number(checks['sentence-length'].params!.avg)).toBeLessThan(8);
  });

  it('still flags a link address that is not in the verified facts, and accepts one that is', () => {
    const text = { introduction: 'Join [here](https://evil.example/pay) today.' };
    const flagged = findUnsupportedClaims(text, ['The open day is on Saturday.']);
    expect(flagged.map((w) => w.type)).toContain('url');
    const ok = findUnsupportedClaims(text, ['Register at https://evil.example/pay']);
    expect(ok.filter((w) => w.type === 'url')).toEqual([]);
  });
});
