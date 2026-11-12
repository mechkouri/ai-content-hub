const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Blank-line separated text becomes paragraphs; single line breaks inside one stay as <br>. */
const paragraphs = (text: unknown) =>
  String(text ?? '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n');

/**
 * The article body as clean semantic HTML for a website. The H1 is not part of it: the site
 * shows the post title itself. All text is escaped, so generated content can never inject markup.
 * Arabic is wrapped right-to-left so it displays correctly even in a left-to-right theme.
 */
export function articleHtml(content: any, language?: string): string {
  const parts: string[] = [];
  if (content?.introduction) parts.push(paragraphs(content.introduction));
  for (const s of Array.isArray(content?.sections) ? content.sections : []) {
    parts.push(`<h2>${esc(s.heading)}</h2>`, paragraphs(s.body));
    for (const sub of Array.isArray(s.subsections) ? s.subsections : []) {
      parts.push(`<h3>${esc(sub.heading)}</h3>`, paragraphs(sub.body));
    }
  }
  if (content?.conclusion) parts.push(paragraphs(content.conclusion));
  const faq = Array.isArray(content?.faq) ? content.faq : [];
  if (faq.length) {
    parts.push('<h2>FAQ</h2>');
    for (const f of faq) parts.push(`<h3>${esc(f.question)}</h3>`, paragraphs(f.answer));
  }
  const body = parts.filter(Boolean).join('\n');
  return language === 'ar' ? `<div dir="rtl" lang="ar">\n${body}\n</div>` : body;
}
