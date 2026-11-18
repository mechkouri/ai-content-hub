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
  // A picture is only shown as a paragraph of its own (see article-html); one in the middle of a sentence is dropped.
  text = removeImages(text);
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
  return removeImages(text).replace(LINK, '$1').replace(BOLD, '$1').replace(ITALIC, '$1');
}

// ---------- pictures inside the text ----------
// A picture is a paragraph of its own: ![alt text](media:ID "caption"). The ID is a picture of the media library.
// The caption is where the credit for a free picture lives.

// Written as regular expressions (not built from strings) so every backslash is exactly what it looks like.
const IMAGE_ANYWHERE =
  /!\[[^\]\n]*\]\(media:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(?:\s+"[^"\n]*")?\)/g;
const IMAGE_BLOCK =
  /^!\[([^\]\n]*)\]\(media:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})(?:\s+"([^"\n]*)")?\)$/;

export interface ImageBlock {
  alt: string;
  assetId: string;
  caption: string;
}

/** The picture a paragraph is made of, or null when it is ordinary text. */
export function parseImageBlock(paragraph: string): ImageBlock | null {
  const m = IMAGE_BLOCK.exec(paragraph.trim());
  return m ? { alt: m[1], assetId: m[2].toLowerCase(), caption: m[3] ?? '' } : null;
}

/** Writes a picture paragraph. Characters that would end the syntax early are replaced. */
export function buildImageBlock(b: ImageBlock): string {
  const alt = b.alt.replace(/[\][\n]/g, ' ').trim();
  const caption = b.caption.replace(/"/g, '”').replace(/\n/g, ' ').trim();
  return `![${alt}](media:${b.assetId.toLowerCase()}${caption ? ` "${caption}"` : ''})`;
}

/** Every picture a text refers to, once each, in order. */
export function imageAssetIds(text: string): string[] {
  const ids: string[] = [];
  for (const m of text.matchAll(IMAGE_ANYWHERE)) {
    const id = /media:([0-9a-fA-F-]{36})/.exec(m[0])![1].toLowerCase();
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** Every picture block in a text, in order (the same picture may appear more than once). */
export function imageBlocksIn(text: string): ImageBlock[] {
  return text
    .split(/\n{2,}/)
    .map((p) => parseImageBlock(p))
    .filter((b): b is ImageBlock => b !== null);
}

/** The text without its pictures. Their ids, captions and credits are not words to check or count. */
export function removeImages(text: string): string {
  return text.replace(IMAGE_ANYWHERE, '');
}
