import { combine, pickPages } from './site-crawl';

describe('pickPages', () => {
  const home = 'https://a.example/';

  it('takes pages from the sitemap and the home page links, same site only, without duplicates', () => {
    const xml = `<urlset><url><loc>https://a.example/courses</loc></url>
      <url><loc> https://a.example/contact#top </loc></url>
      <url><loc>https://other.example/x</loc></url>
      <url><loc>https://a.example/photo.jpg</loc></url></urlset>`;
    const html = `<a href="/courses">c</a><a href="about">a</a><a href="mailto:x@a.example">m</a>
      <a href="https://www.a.example/prices?utm=1">p</a><a href="/">home</a><a href="/brochure.pdf">b</a>`;
    expect(pickPages(home, html, xml, 10)).toEqual([
      'https://a.example/courses',
      'https://a.example/contact',
      'https://a.example/about',
      'https://www.a.example/prices?utm=1',
    ]);
  });

  it('ignores a sitemap of sitemaps and respects the limit', () => {
    const index =
      '<sitemapindex><sitemap><loc>https://a.example/s1.xml</loc></sitemap></sitemapindex>';
    const html = Array.from({ length: 30 }, (_, i) => `<a href="/p${i}">x</a>`).join('');
    const pages = pickPages(home, html, index, 9);
    expect(pages).toHaveLength(9);
    expect(pages.some((p) => p.endsWith('.xml'))).toBe(false);
  });
});

describe('combine', () => {
  const page = (url: string, title: string, failing: string[]) => ({
    url,
    title,
    score: 50,
    checks: ['title', 'meta', 'lang'].map((id) => ({
      id,
      impact: (id === 'lang' ? 3 : 1) as 1 | 3,
      ok: !failing.includes(id),
    })),
  });

  it('counts problems across pages, worst first, and finds repeated titles', () => {
    const out = combine([
      page('https://a.example/', 'Same title', ['lang', 'meta']),
      page('https://a.example/b', 'same title ', ['lang', 'meta']),
      page('https://a.example/c', 'Other', ['lang', 'title']),
    ]);
    expect(out.problems.map((p) => [p.id, p.pages.length])).toEqual([
      ['meta', 2],
      ['title', 1],
      ['lang', 3],
    ]);
    expect(out.duplicateTitles).toEqual([
      { title: 'Same title', pages: ['https://a.example/', 'https://a.example/b'] },
    ]);
    expect(out.score).toBe(50);
  });
});
