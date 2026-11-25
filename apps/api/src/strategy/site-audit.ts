import * as cheerio from 'cheerio';

/** 1 = fix first, 2 = important, 3 = nice to have. */
export type Impact = 1 | 2 | 3;

export interface SiteCheck {
  id: string;
  ok: boolean;
  impact: Impact;
  params?: Record<string, number>;
}

export interface PageAudit {
  checks: SiteCheck[];
  title: string;
  headings: string[];
}

const WEIGHT: Record<Impact, number> = { 1: 4, 2: 2, 3: 1 };

/**
 * Real checks on one page's HTML (nothing here is estimated or written by AI). Results are ordered with the
 * problems that matter most first.
 */
export function auditPage(html: string, url: string): PageAudit {
  const $ = cheerio.load(html);
  const meta = (selector: string) => ($(selector).attr('content') ?? '').trim();
  const title = $('head title').first().text().trim() || $('title').first().text().trim();
  const description = meta('meta[name="description" i]');
  const robots = meta('meta[name="robots" i]').toLowerCase();
  const h1 = $('h1').length;
  const images = $('img').length;
  const withoutAlt = $('img').filter((_, el) => $(el).attr('alt') === undefined).length;
  const headings = $('h1, h2')
    .map((_, el) => $(el).text().replace(/\s+/g, ' ').trim())
    .get()
    .filter(Boolean)
    .slice(0, 15);
  const hasStructuredData = $('script[type="application/ld+json"]').length > 0;
  const body = $('body').clone();
  body.find('script, style, noscript, template').remove();
  const words = body
    .text()
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

  const check = (id: string, impact: Impact, ok: boolean, params?: SiteCheck['params']) => ({
    id,
    impact,
    ok,
    ...(params ? { params } : {}),
  });
  const checks: SiteCheck[] = [
    check('indexable', 1, !robots.includes('noindex')),
    check('https', 1, url.startsWith('https://')),
    check('title', 1, title.length >= 25 && title.length <= 65, { n: title.length }),
    check('meta', 1, description.length >= 70 && description.length <= 165, {
      n: description.length,
    }),
    check('h1', 1, h1 === 1, { n: h1 }),
    check('mobile', 1, meta('meta[name="viewport" i]') !== ''),
    check('words', 2, words >= 300, { n: words }),
    check('h2', 2, $('h2').length > 0),
    check('alt', 2, withoutAlt === 0, { n: withoutAlt, total: images }),
    check('schema', 2, hasStructuredData),
    check('lang', 3, ($('html').attr('lang') ?? '').trim() !== ''),
    check(
      'social',
      3,
      meta('meta[property="og:title"]') !== '' && meta('meta[property="og:image"]') !== '',
    ),
    check('canonical', 3, ($('link[rel="canonical"]').attr('href') ?? '').trim() !== ''),
  ];
  checks.sort((a, b) => Number(a.ok) - Number(b.ok) || a.impact - b.impact);
  return { checks, title: title.slice(0, 200), headings };
}

/** 0 to 100, with the important checks counting for more. */
export function auditScore(checks: SiteCheck[]): number {
  const total = checks.reduce((n, c) => n + WEIGHT[c.impact], 0);
  const passed = checks.reduce((n, c) => n + (c.ok ? WEIGHT[c.impact] : 0), 0);
  return total ? Math.round((passed / total) * 100) : 0;
}
