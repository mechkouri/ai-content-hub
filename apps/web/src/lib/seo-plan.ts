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

/** The plan as a CSV file that opens in Excel or Google Sheets (the BOM keeps Arabic and accents readable). */
export function planToCsv(plan: SeoPlan, header: [string, string, string, string, string]): string {
  const rows: (string | number)[][] = [
    header,
    ...plan.articles.map((a) => [a.priority, a.title, a.keyword, a.intent, a.outline.join(' | ')]),
    ...plan.clusters.flatMap((c) => c.keywords.map((k) => ['', '', k, c.intent, c.name])),
  ];
  return `﻿${rows.map((r) => r.map(cell).join(',')).join('\r\n')}`;
}

/** Where "Write this article" leads: the quick create box, with the topic and keyword filled in. */
export const writeArticleLink = (title: string, keyword: string) =>
  `/studio?${new URLSearchParams({ topic: title, keyword }).toString()}`;

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
