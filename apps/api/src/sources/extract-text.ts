import { BadRequestException } from '@nestjs/common';
import * as cheerio from 'cheerio';
import mammoth from 'mammoth';
// Import the library file directly: the package index runs a debug script on load.
const pdfParse: (
  data: Buffer,
  opts?: { max?: number },
) => Promise<{ text: string; numpages: number }> =
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('pdf-parse/lib/pdf-parse.js');

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_TEXT_CHARS = 200_000;
const MAX_PDF_PAGES = 60;

export type FileKind = 'PDF' | 'DOCX';

/** Detects the real file type from magic bytes (the client-declared type is never trusted). */
export function detectFileKind(buf: Buffer): FileKind | null {
  if (buf.length > 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'PDF';
  if (buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04)
    return 'DOCX';
  return null;
}

export function cleanText(text: string): string {
  return text
    .replaceAll('\u0000', '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function extractFromFile(buf: Buffer, kind: FileKind): Promise<string> {
  try {
    if (kind === 'PDF') {
      // pdf.js reads the underlying ArrayBuffer directly, but small Node Buffers live inside a shared
      // pool at a non-zero offset, which makes it read the wrong bytes. Hand it a standalone copy.
      const res = await pdfParse(new Uint8Array(buf) as unknown as Buffer, { max: MAX_PDF_PAGES });
      return cleanText(res.text);
    }
    const res = await mammoth.extractRawText({ buffer: buf });
    return cleanText(res.value);
  } catch {
    throw new BadRequestException(
      kind === 'PDF'
        ? 'This PDF could not be read. It may be damaged or password protected.'
        : 'This DOCX could not be read. It may be damaged.',
    );
  }
}

/** Pulls the readable main text and a title out of an HTML page. */
export function extractFromHtml(html: string): { title: string | null; text: string } {
  const $ = cheerio.load(html);
  const title = (
    $('meta[property="og:title"]').attr('content') ||
    $('title').first().text() ||
    $('h1').first().text() ||
    ''
  ).trim();
  $(
    'script, style, noscript, template, iframe, svg, canvas, form, nav, footer, header, aside, [aria-hidden="true"]',
  ).remove();
  const root = $('article').first().length
    ? $('article').first()
    : $('main').first().length
      ? $('main').first()
      : $('body');
  // Keep block structure as line breaks.
  root.find('br').replaceWith('\n');
  root.find('p, h1, h2, h3, h4, h5, h6, li, tr, div, section, blockquote').each((_, el) => {
    $(el).append('\n');
  });
  return { title: title || null, text: cleanText(root.text()) };
}

// ---- language detection (fr / en / ar) ----

const FR = new Set(
  'le la les des du de un une et est sont pour avec dans sur par au aux ce cette ces qui que nous vous ils elle être avoir plus pas sera date inscription'.split(
    ' ',
  ),
);
const EN = new Set(
  'the and of to is are for with in on by this that these who we you they be have will not at from date registration'.split(
    ' ',
  ),
);

export function detectLanguage(text: string): 'fr' | 'en' | 'ar' | 'unknown' {
  const sample = text.slice(0, 6000);
  const letters = sample.match(/\p{L}/gu)?.length ?? 0;
  if (letters < 20) return 'unknown';
  const arabic = sample.match(/[\u0600-\u06FF\u0750-\u077F]/g)?.length ?? 0;
  if (arabic / letters > 0.3) return 'ar';
  const words = sample.toLowerCase().match(/\p{L}+/gu) ?? [];
  let fr = 0;
  let en = 0;
  for (const w of words) {
    if (FR.has(w)) fr++;
    if (EN.has(w)) en++;
  }
  if (/[àâçéèêëîïôûùüÿœ]/i.test(sample)) fr += 2;
  if (fr === 0 && en === 0) return 'unknown';
  return fr > en ? 'fr' : 'en';
}

export function titleFromText(text: string): string {
  const first =
    text
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.length >= 3) ?? 'Untitled source';
  return first.length > 100 ? `${first.slice(0, 97)}…` : first;
}
