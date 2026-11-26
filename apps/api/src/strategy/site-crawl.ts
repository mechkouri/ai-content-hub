import * as cheerio from 'cheerio';
import { Impact, SiteCheck } from './site-audit';

const NOT_A_PAGE =
  /\.(?:jpe?g|png|gif|webp|svg|ico|pdf|zip|mp4|mp3|css|js|json|xml|txt|docx?|xlsx?)$/i;

const bare = (host: string) => host.toLowerCase().replace(/^www\./, '');

/** A page address on the same site, cleaned up, or null. */
function samePage(href: string, home: URL): string | null {
  let url: URL;
  try {
    url = new URL(href.trim(), home);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol)) return null;
  if (bare(url.hostname) !== bare(home.hostname) || url.port !== home.port) return null;
  if (NOT_A_PAGE.test(url.pathname)) return null;
  url.hash = '';
  if (url.pathname === home.pathname && url.search === home.search) return null;
  return url.toString();
}

/** Which other pages to check: first the ones the sitemap lists, then the ones the home page links to. */
export function pickPages(homeUrl: string, html: string, sitemap: string | null, max: number) {
  const home = new URL(homeUrl);
  const listed = [...(sitemap ?? '').matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((m) =>
    m[1].replace(/&amp;/g, '&'),
  );
  const $ = cheerio.load(html);
  const linked = $('a[href]')
    .map((_, el) => $(el).attr('href') ?? '')
    .get();
  const out: string[] = [];
  for (const href of [...listed, ...linked]) {
    const page = samePage(href, home);
    if (page && !out.includes(page)) out.push(page);
    if (out.length >= max) break;
  }
  return out;
}

export interface CheckedPage {
  url: string;
  title: string;
  score: number;
  checks: SiteCheck[];
}

/** Turns the per-page results into one list of what to fix across the site. */
export function combine(pages: CheckedPage[]) {
  const problems = new Map<string, { id: string; impact: Impact; pages: string[] }>();
  const titles = new Map<string, { title: string; pages: string[] }>();
  for (const page of pages) {
    for (const check of page.checks.filter((c) => !c.ok)) {
      const entry = problems.get(check.id) ?? { id: check.id, impact: check.impact, pages: [] };
      entry.pages.push(page.url);
      problems.set(check.id, entry);
    }
    const key = page.title.trim().toLowerCase();
    if (key) {
      const entry = titles.get(key) ?? { title: page.title.trim(), pages: [] };
      entry.pages.push(page.url);
      titles.set(key, entry);
    }
  }
  return {
    score: pages.length ? Math.round(pages.reduce((n, p) => n + p.score, 0) / pages.length) : 0,
    problems: [...problems.values()].sort(
      (a, b) => a.impact - b.impact || b.pages.length - a.pages.length,
    ),
    duplicateTitles: [...titles.values()].filter((t) => t.pages.length > 1),
    pages: pages.map(({ url, title, score }) => ({ url, title, score })),
  };
}
