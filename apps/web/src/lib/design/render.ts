// Draws a design document on a canvas in the browser. The browser itself shapes and orders Arabic text,
// and the app's own fonts are already loaded, so French, Arabic and English all render correctly.
import { Brand, Doc, El, FORMATS, ImageEl, isRtl, resolveFill, ShapeEl, TextEl } from './doc';

const SHIPPED = ['Inter', 'Plus Jakarta Sans', 'Geist', 'Cairo', 'Tajawal'];

/** The CSS font stack for a font choice. Anything the app does not ship falls back to a shipped font. */
export function fontStack(choice: string, brand: Brand, arabic: boolean): string {
  const family =
    choice === 'heading' ? brand.headingFont : choice === 'body' ? brand.bodyFont : choice;
  const heading = choice !== 'body' && choice !== 'Tajawal' && choice !== 'Inter';
  const arabicFace = heading ? 'Cairo' : 'Tajawal';
  const latin = SHIPPED.includes(family) ? family : heading ? 'Plus Jakarta Sans' : 'Inter';
  return arabic
    ? `"${arabicFace}", "${latin}", sans-serif`
    : `"${latin}", "${arabicFace}", sans-serif`;
}

const fontCss = (el: TextEl, brand: Brand, arabic: boolean) =>
  `${el.italic ? 'italic ' : ''}${el.bold ? 700 : 500} ${el.size}px ${fontStack(el.font, brand, arabic)}`;

/** Loads the fonts a document uses, so the first draw is not in a fallback font. */
export async function ensureDocFonts(doc: Doc, brand: Brand) {
  if (typeof document === 'undefined' || !document.fonts) return;
  const jobs: Promise<unknown>[] = [];
  for (const e of doc.elements) {
    if (e.type !== 'text') continue;
    const ar = isRtl(e.text);
    jobs.push(
      document.fonts.load(fontCss({ ...e, size: 40 }, brand, ar), e.text || 'Aa').catch(() => []),
    );
  }
  await Promise.all(jobs);
}

let scratch: CanvasRenderingContext2D | null = null;
const measureCtx = () => {
  if (!scratch) scratch = document.createElement('canvas').getContext('2d');
  return scratch!;
};

/** Splits text into lines that fit the width. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split(/\n/)) {
    const words = para.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(test).width > maxWidth) {
        lines.push(line);
        line = word;
      } else line = test;
    }
    if (line) lines.push(line);
  }
  return lines;
}

const display = (el: TextEl) => (el.uppercase ? el.text.toUpperCase() : el.text);

export function layoutText(el: TextEl, brand: Brand, ctx = measureCtx()) {
  const rtl = isRtl(el.text);
  ctx.font = fontCss(el, brand, rtl);
  (ctx as any).letterSpacing = rtl ? '0px' : `${el.letterSpacing}px`;
  const lines = wrap(ctx, display(el), Math.max(10, el.w - el.padding * 2));
  const height = Math.max(1, lines.length) * el.size * el.lineHeight + el.padding * 2;
  return { lines, height, rtl };
}

/** The height a text element needs at its current width, size and text. */
export const textHeight = (el: TextEl, brand: Brand) => Math.ceil(layoutText(el, brand).height);

/** The width the text takes on one line, for sizing buttons and labels around it. */
export function textWidth(el: TextEl, brand: Brand): number {
  const ctx = measureCtx();
  const rtl = isRtl(el.text);
  ctx.font = fontCss(el, brand, rtl);
  (ctx as any).letterSpacing = rtl ? '0px' : `${el.letterSpacing}px`;
  return Math.ceil(
    Math.max(
      ...display(el)
        .split('\n')
        .map((l) => ctx.measureText(l).width),
    ) +
      el.padding * 2,
  );
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
  fit: 'cover' | 'contain',
  radius: number,
) {
  ctx.save();
  if (radius > 0) {
    roundRect(ctx, 0, 0, w, h, radius);
    ctx.clip();
  }
  const scale =
    fit === 'cover'
      ? Math.max(w / img.naturalWidth, h / img.naturalHeight)
      : Math.min(w / img.naturalWidth, h / img.naturalHeight);
  const iw = img.naturalWidth * scale;
  const ih = img.naturalHeight * scale;
  ctx.drawImage(img, (w - iw) / 2, (h - ih) / 2, iw, ih);
  ctx.restore();
}

export interface RenderOptions {
  /** Loaded media pictures by asset id. */
  images: Map<string, HTMLImageElement>;
  logo: HTMLImageElement | null;
  /** An element drawn by the editor itself (while its text is being typed). */
  hideId?: string | null;
  /** Show a dashed box where the logo will go. Only the editor does this: never in exports or thumbnails. */
  placeholders?: boolean;
}

function drawElement(ctx: CanvasRenderingContext2D, e: El, brand: Brand, o: RenderOptions) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, e.opacity));
  ctx.translate(e.x + e.w / 2, e.y + e.h / 2);
  ctx.rotate((e.rotation * Math.PI) / 180);
  ctx.translate(-e.w / 2, -e.h / 2);

  if (e.type === 'shape') drawShape(ctx, e, brand);
  else if (e.type === 'image') {
    const img = o.images.get(e.assetId);
    if (img) drawImage(ctx, img, e.w, e.h, e.fit, e.radius);
    else {
      ctx.fillStyle = '#e2e8f0';
      roundRect(ctx, 0, 0, e.w, e.h, e.radius);
      ctx.fill();
    }
  } else if (e.type === 'logo') {
    if (o.logo) drawImage(ctx, o.logo, e.w, e.h, 'contain', 0);
    else if (o.placeholders) {
      ctx.strokeStyle = '#94a3b8';
      ctx.setLineDash([10, 8]);
      ctx.lineWidth = 3;
      ctx.strokeRect(1.5, 1.5, e.w - 3, e.h - 3);
    }
  } else drawText(ctx, e, brand);
  ctx.restore();
}

function drawShape(ctx: CanvasRenderingContext2D, e: ShapeEl, brand: Brand) {
  const fill = resolveFill(e.fill, brand);
  if (e.shape === 'gradient') {
    const g = ctx.createLinearGradient(0, 0, 0, e.h);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, fill);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, e.w, e.h);
    return;
  }
  ctx.fillStyle = fill;
  if (e.shape === 'ellipse') {
    ctx.beginPath();
    ctx.ellipse(
      e.w / 2,
      e.h / 2,
      Math.max(0.5, e.w / 2),
      Math.max(0.5, e.h / 2),
      0,
      0,
      Math.PI * 2,
    );
  } else roundRect(ctx, 0, 0, e.w, e.h, e.radius);
  ctx.fill();
  if (e.stroke && e.strokeWidth > 0) {
    ctx.strokeStyle = resolveFill(e.stroke, brand);
    ctx.lineWidth = e.strokeWidth;
    ctx.stroke();
  }
}

function drawText(ctx: CanvasRenderingContext2D, e: TextEl, brand: Brand) {
  const { lines, rtl } = layoutText(e, brand, ctx);
  if (e.box) {
    ctx.fillStyle = resolveFill(e.box, brand);
    roundRect(ctx, 0, 0, e.w, e.h, e.boxRadius);
    ctx.fill();
  }
  ctx.fillStyle = resolveFill(e.color, brand);
  ctx.direction = rtl ? 'rtl' : 'ltr';
  ctx.textBaseline = 'top';
  ctx.textAlign = e.align;
  const x = e.align === 'left' ? e.padding : e.align === 'right' ? e.w - e.padding : e.w / 2;
  const lh = e.size * e.lineHeight;
  // The box may be taller than the text (the user stretched it): keep the text centred in a button-like box.
  const free = e.h - (lines.length * lh + e.padding * 2);
  let y = e.padding + (e.box && free > 0 ? free / 2 : 0) + (lh - e.size) / 2;
  for (const line of lines) {
    ctx.fillText(line, x, y, e.w - e.padding * 2 + 2);
    y += lh;
  }
}

/** Draws the whole document at its full size. */
export function renderDoc(canvas: HTMLCanvasElement, doc: Doc, brand: Brand, o: RenderOptions) {
  const { w, h } = FORMATS[doc.format];
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = resolveFill(doc.background, brand);
  ctx.fillRect(0, 0, w, h);
  for (const e of doc.elements) {
    if (e.id === o.hideId) continue;
    drawElement(ctx, e, brand, o);
  }
}
