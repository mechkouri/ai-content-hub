// Pictures inside an article's text are paragraphs of their own: ![description](media:ID "caption").
// The API reads the same syntax (common/inline.ts). The editor shows them as picture cards and keeps the text a
// plain string, so nothing else about an article changes.

const IMAGE_BLOCK =
  /^!\[([^\]\n]*)\]\(media:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})(?:\s+"([^"\n]*)")?\)$/;

export interface PictureBlock {
  alt: string;
  assetId: string;
  caption: string;
}

export type TextSegment = { type: 'text'; text: string };
export type ImageSegment = { type: 'image' } & PictureBlock;
/** What a body is made of, without the identity React needs. */
export type SegmentData = TextSegment | ImageSegment;
export type Segment = SegmentData & { key: number };

export function parsePicture(paragraph: string): PictureBlock | null {
  const m = IMAGE_BLOCK.exec(paragraph.trim());
  return m ? { alt: m[1], assetId: m[2].toLowerCase(), caption: m[3] ?? '' } : null;
}

/** Writes a picture paragraph. Characters that would end the syntax early are replaced. */
export function writePicture(b: PictureBlock): string {
  const alt = b.alt.replace(/[\][\n]/g, ' ').trim();
  const caption = b.caption.replace(/"/g, '”').replace(/\n/g, ' ').trim();
  return `![${alt}](media:${b.assetId.toLowerCase()}${caption ? ` "${caption}"` : ''})`;
}

/**
 * Splits a text into runs of ordinary paragraphs and single pictures, in order. There is always a text run at the
 * end, so a cursor can be placed after the last picture.
 */
export function splitBody(value: string): Segment[] {
  const out: Segment[] = [];
  let run: string[] = [];
  let key = 0;
  const flush = () => {
    if (run.length) out.push({ type: 'text', text: run.join('\n\n'), key: key++ });
    run = [];
  };
  for (const para of value.split(/\n{2,}/)) {
    const pic = parsePicture(para);
    if (pic) {
      flush();
      out.push({ type: 'image', ...pic, key: key++ });
    } else if (para.trim() || run.length || out.length === 0) {
      run.push(para);
    }
  }
  flush();
  if (out.length === 0 || out[out.length - 1].type === 'image') {
    out.push({ type: 'text', text: '', key: key++ });
  }
  return out;
}

/** Puts the runs and pictures back together as one text. Empty runs disappear. */
export function joinBody(segments: SegmentData[]): string {
  return segments
    .map((s) => (s.type === 'image' ? writePicture(s) : s.text.replace(/^\n+|\n+$/g, '')))
    .filter((t) => t.trim())
    .join('\n\n');
}

/** A starting description for a picture, taken from its file name ("students-on-campus.webp"). */
export function altFromFilename(name: string): string {
  const base = name
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : '';
}
