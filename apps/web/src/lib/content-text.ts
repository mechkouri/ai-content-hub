import {
  AnyContent,
  ArticleContent,
  ContentKind,
  FacebookContent,
  InstagramContent,
  LinkedinContent,
} from './api';

/** Markdown for pasting an article into a CMS (WordPress, Notion...). */
export function articleToMarkdown(a: ArticleContent): string {
  const parts = [`# ${a.h1}`, '', a.introduction];
  for (const s of a.sections) {
    parts.push('', `## ${s.heading}`, '', s.body);
    for (const sub of s.subsections ?? []) parts.push('', `### ${sub.heading}`, '', sub.body);
  }
  parts.push('', a.conclusion);
  if (a.faq.length) {
    parts.push('', '## FAQ');
    for (const f of a.faq) parts.push('', `### ${f.question}`, '', f.answer);
  }
  return parts.join('\n');
}

const tags = (h: string[]) => (h.length ? `\n\n${h.join(' ')}` : '');

/** Plain text ready to paste into a social network. */
export function socialToText(kind: Exclude<ContentKind, 'ARTICLE'>, c: AnyContent): string {
  if (kind === 'INSTAGRAM') {
    const p = c as InstagramContent;
    return `${p.caption}\n\n${p.cta}${tags(p.hashtags)}`;
  }
  const p = c as FacebookContent | LinkedinContent;
  const link =
    kind === 'FACEBOOK' && (p as FacebookContent).link ? `\n${(p as FacebookContent).link}` : '';
  return `${p.postText}\n\n${p.cta}${link}${tags(p.hashtags)}`;
}

export function contentToText(kind: ContentKind, c: AnyContent): string {
  return kind === 'ARTICLE' ? articleToMarkdown(c as ArticleContent) : socialToText(kind, c);
}

export function isDirty(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}
