// Light inline formatting for article text: **bold**, *italic* and [text](https://link). It is what the editor's
// buttons write, and it is read the same way everywhere the text is used (website HTML, word counts, SEO checks).
// Anything else stays plain text, and every character is escaped when it becomes HTML.

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const LINK = /\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)<>"']{1,500})\)/g;
// The marks must hug the words: "a * b * c" and "2 * 3" are arithmetic, not emphasis.
const BOLD = /\*\*(?=\S)([^*\n]+?)(?<=\S)\*\*/g;
const ITALIC = /(?<![*\w])\*(?=\S)([^*\n]+?)(?<=\S)\*(?![*\w])/g;

/** Bold and italic in text that is already free of links. Escapes first, so no markup can get through. */
function emphasis(text: string): string {
  return esc(text).replace(BOLD, '<strong>$1</strong>').replace(ITALIC, '<em>$1</em>');
}

/** The text as safe HTML: links open with rel="noopener", only http and https addresses become links. */
export function inlineToHtml(text: string): string {
  let out = '';
  let last = 0;
  for (const m of text.matchAll(LINK)) {
    const at = m.index ?? 0;
    out += emphasis(text.slice(last, at));
    out += `<a href="${esc(m[2])}" rel="noopener">${emphasis(m[1])}</a>`;
    last = at + m[0].length;
  }
  return out + emphasis(text.slice(last));
}

/** The words without the markers, for counting and reading checks. A link keeps its text, not its address. */
export function stripInline(text: string): string {
  return text.replace(LINK, '$1').replace(BOLD, '$1').replace(ITALIC, '$1');
}
