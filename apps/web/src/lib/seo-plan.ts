import { plain } from './quick-create';

export type Intent = 'informational' | 'local' | 'commercial' | 'transactional';

export interface SiteCheck {
  id: string;
  ok: boolean;
  impact: 1 | 2 | 3;
  params?: Record<string, number>;
}

export interface SeoPlan {
  summary: string;
  clusters: { name: string; intent: Intent; keywords: string[] }[];
  articles: {
    title: string;
    keyword: string;
    intent: Intent;
    why: string;
    outline: string[];
    priority: number;
    covered: boolean;
  }[];
  quickWins: string[];
  site: { url: string; score: number; checks: SiteCheck[] } | null;
  siteError: string | null;
}

/** One spreadsheet cell. A leading = + - @ would be run as a formula by a spreadsheet, so it is made plain text. */
function cell(value: string | number): string {
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** Rows as CSV text (the BOM keeps Arabic and accents readable in Excel). */
const csvText = (rows: (string | number)[][]) =>
  `\uFEFF${rows.map((r) => r.map(cell).join(',')).join('\r\n')}`;

/** The plan as a CSV file that opens in Excel or Google Sheets (the BOM keeps Arabic and accents readable). */
export function planToCsv(plan: SeoPlan, header: [string, string, string, string, string]): string {
  const rows: (string | number)[][] = [
    header,
    ...plan.articles.map((a) => [a.priority, a.title, a.keyword, a.intent, a.outline.join(' | ')]),
    ...plan.clusters.flatMap((c) => c.keywords.map((k) => ['', '', k, c.intent, c.name])),
  ];
  return csvText(rows);
}

/** Where "Write this article" leads: the quick create box, with the topic and keyword filled in. */
export const writeArticleLink = (title: string, keyword: string) =>
  `/studio?${new URLSearchParams({ topic: title, keyword }).toString()}`;

/** Two keywords are the same search when only capitals, accents or spaces differ; articles keep 80 characters. */
const keywordKey = (s: string) => plain(s.slice(0, 80)).trim();

/**
 * The article already written for a planned one: same focus keyword or same title. The keyword box of quick
 * create keeps 80 characters.
 */
export function writtenArticle<
  P extends { kind: string; title: string; primaryKeyword?: string | null },
>(planned: { title: string; keyword: string }, pieces: P[]): P | undefined {
  const keyword = keywordKey(planned.keyword);
  const title = plain(planned.title).trim();
  return pieces.find(
    (p) =>
      p.kind === 'ARTICLE' &&
      ((keyword !== '' && keywordKey(p.primaryKeyword ?? '') === keyword) ||
        plain(p.title).trim() === title),
  );
}

/** Other articles in the same language aiming at the same keyword: they compete with each other in search. */
export function sameKeywordArticles<
  P extends { id: string; kind: string; language: string; primaryKeyword?: string | null },
>(keyword: string, current: { id: string; language: string }, pieces: P[]): P[] {
  const wanted = keywordKey(keyword);
  if (!wanted) return [];
  return pieces.filter(
    (p) =>
      p.id !== current.id &&
      p.kind === 'ARTICLE' &&
      p.language === current.language &&
      keywordKey(p.primaryKeyword ?? '') === wanted,
  );
}

export interface SiteReport {
  url: string;
  score: number;
  hasSitemap: boolean;
  pages: { url: string; title: string; score: number }[];
  problems: { id: string; impact: 1 | 2 | 3; pages: string[] }[];
  duplicateTitles: { title: string; pages: string[] }[];
  unreadable: string[];
}

/** People type "www.example.com"; the server needs a full address. */
export const fullAddress = (site: string) =>
  /^https?:\/\//i.test(site.trim()) ? site.trim() : `https://${site.trim()}`;

/** The website check as a to-do list: one row for every problem on every page, most important first. */
export function reportToCsv(
  report: SiteReport,
  words: {
    header: [string, string, string];
    problem: (id: string) => string;
    impact: (level: 1 | 2 | 3) => string;
    sameTitle: string;
  },
): string {
  return csvText([
    words.header,
    ...report.problems.flatMap((p) =>
      p.pages.map((url) => [words.impact(p.impact), words.problem(p.id), url]),
    ),
    ...report.duplicateTitles.flatMap((d) =>
      d.pages.map((url) => [words.impact(2), `${words.sameTitle} ${d.title}`, url]),
    ),
  ]);
}
