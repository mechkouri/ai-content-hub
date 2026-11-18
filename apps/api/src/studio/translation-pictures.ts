import { buildImageBlock, parseImageBlock } from '../common/inline';

/** One picture taken out of the text for the translator, with where it sat. */
export interface PictureRef {
  n: number;
  assetId: string;
  alt: string;
  caption: string;
  /** Where it was, so a picture the translator loses can be put back in the same place. */
  path: Field;
}

type Field =
  | { at: 'introduction' }
  | { at: 'conclusion' }
  | { at: 'body'; section: number }
  | { at: 'sub'; section: number; sub: number }
  | { at: 'answer'; faq: number };

const PLACEHOLDER =
  /^\[\[\s*(?:PICTURE|IMAGE|IMG|PHOTO|IMAGEN|IMAGE)\s*(\d+)\s*(?::\s*([^\]]*?))?\s*\]\]$/i;

const STRAY = /\[\[\s*(?:PICTURE|IMAGE|IMG|PHOTO)\s*\d+[^\]]*\]\]/gi;

/** All the places in an article where running text (and so a picture) can be. */
function fieldsOf(content: any): { path: Field; get: () => unknown; set: (v: string) => void }[] {
  const out: { path: Field; get: () => unknown; set: (v: string) => void }[] = [];
  out.push({
    path: { at: 'introduction' },
    get: () => content.introduction,
    set: (v) => (content.introduction = v),
  });
  (content.sections ?? []).forEach((s: any, i: number) => {
    out.push({ path: { at: 'body', section: i }, get: () => s.body, set: (v) => (s.body = v) });
    (s.subsections ?? []).forEach((x: any, j: number) =>
      out.push({
        path: { at: 'sub', section: i, sub: j },
        get: () => x.body,
        set: (v) => (x.body = v),
      }),
    );
  });
  out.push({
    path: { at: 'conclusion' },
    get: () => content.conclusion,
    set: (v) => (content.conclusion = v),
  });
  (content.faq ?? []).forEach((f: any, i: number) =>
    out.push({ path: { at: 'answer', faq: i }, get: () => f.answer, set: (v) => (f.answer = v) }),
  );
  return out;
}

/**
 * Takes every picture out of an article's text and leaves a marker, [[PICTURE 1: description]], on a line of its
 * own. A translator can then translate the description without touching the syntax, the picture's address or its
 * credit. Returns a copy; the original is not changed.
 */
export function protectPictures(content: unknown): { content: any; pictures: PictureRef[] } {
  const copy = JSON.parse(JSON.stringify(content ?? {}));
  const pictures: PictureRef[] = [];
  for (const f of fieldsOf(copy)) {
    const text = f.get();
    if (typeof text !== 'string') continue;
    const paragraphs = text.split(/\n{2,}/).map((p) => {
      const b = parseImageBlock(p);
      if (!b) return p;
      const n = pictures.length + 1;
      pictures.push({ n, assetId: b.assetId, alt: b.alt, caption: b.caption, path: f.path });
      return `[[PICTURE ${n}${b.alt ? `: ${b.alt}` : ''}]]`;
    });
    f.set(paragraphs.join('\n\n'));
  }
  return { content: copy, pictures };
}

/**
 * Puts the pictures back into the translated article, with their descriptions as translated and everything else
 * (address, caption and credit) exactly as before. A picture the translator dropped is added back at the end of
 * the place it came from, so a translation never loses a picture.
 */
export function restorePictures(translated: unknown, pictures: PictureRef[]): any {
  const content: any = JSON.parse(JSON.stringify(translated ?? {}));
  const placed = new Set<number>();
  const byNumber = new Map(pictures.map((p) => [p.n, p]));

  for (const f of fieldsOf(content)) {
    const text = f.get();
    if (typeof text !== 'string') continue;
    const paragraphs = text.split(/\n{2,}/).map((para) => {
      const m = PLACEHOLDER.exec(para.trim());
      if (!m) return para;
      const original = byNumber.get(Number(m[1]));
      if (!original || placed.has(original.n)) return ''; // an unknown or repeated marker is dropped
      placed.add(original.n);
      const alt = (m[2] ?? '').trim() || original.alt;
      return buildImageBlock({ alt, assetId: original.assetId, caption: original.caption });
    });
    f.set(paragraphs.filter((p) => p.trim() !== '').join('\n\n'));
  }

  // A marker left in the middle of a sentence, or invented, must never reach the saved text.
  for (const f of fieldsOf(content)) {
    const text = f.get();
    if (typeof text === 'string') f.set(text.replace(STRAY, '').replace(/[ 	]{2,}/g, ' '));
  }

  // Anything the translator lost goes back where it was (or, if that place is gone, at the end of the conclusion).
  const fields = fieldsOf(content);
  for (const p of pictures) {
    if (placed.has(p.n)) continue;
    const target =
      fields.find((f) => JSON.stringify(f.path) === JSON.stringify(p.path)) ??
      fields.find((f) => f.path.at === 'conclusion');
    if (!target) continue;
    const block = buildImageBlock({ alt: p.alt, assetId: p.assetId, caption: p.caption });
    const current = String(target.get() ?? '');
    target.set(current.trim() ? `${current}\n\n${block}` : block);
  }
  return content;
}
