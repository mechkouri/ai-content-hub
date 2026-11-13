// The document behind the design editor: a page of a given size with a background colour and a stack of
// elements (text, shapes, pictures). It is plain JSON, so it can be undone, saved as a template and
// sent to the API. Colours may be brand tokens, so a template follows a rebrand.

export type DesignFormat = 'square' | 'portrait' | 'landscape' | 'story';

export const FORMATS: Record<DesignFormat, { w: number; h: number }> = {
  square: { w: 1080, h: 1080 },
  portrait: { w: 1080, h: 1350 },
  landscape: { w: 1200, h: 630 },
  story: { w: 1080, h: 1920 },
};
export const FORMAT_IDS = Object.keys(FORMATS) as DesignFormat[];

/** A hex colour (#rrggbb) or a brand token that is looked up in the brand kit. */
export type Fill = string;
export const TOKENS = ['primary', 'secondary', 'accent', 'white', 'dark'] as const;
export type Token = (typeof TOKENS)[number];

/** A font choice: the brand's heading or body font, or one of the fonts the app ships. */
export const FONT_CHOICES = [
  'heading',
  'body',
  'Inter',
  'Plus Jakarta Sans',
  'Geist',
  'Cairo',
  'Tajawal',
] as const;

interface Base {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Degrees, clockwise. */
  rotation: number;
  opacity: number;
  locked?: boolean;
}

export interface TextEl extends Base {
  type: 'text';
  text: string;
  font: string;
  size: number;
  bold: boolean;
  italic: boolean;
  uppercase: boolean;
  color: Fill;
  align: 'left' | 'center' | 'right';
  lineHeight: number;
  letterSpacing: number;
  /** A filled box behind the text, such as a button or a label. */
  box: Fill | null;
  boxRadius: number;
  /** Space between the text and the edge of its box. */
  padding: number;
}

export interface ShapeEl extends Base {
  type: 'shape';
  shape: 'rect' | 'ellipse' | 'gradient';
  fill: Fill;
  radius: number;
  stroke: Fill | null;
  strokeWidth: number;
}

export interface ImageEl extends Base {
  type: 'image';
  /** A picture of the media library. */
  assetId: string;
  fit: 'cover' | 'contain';
  radius: number;
}

/** The brand kit's logo. */
export interface LogoEl extends Base {
  type: 'logo';
}

export type El = TextEl | ShapeEl | ImageEl | LogoEl;

export interface Doc {
  format: DesignFormat;
  background: Fill;
  elements: El[];
}

export const MAX_ELEMENTS = 80;

export const newId = () => Math.random().toString(36).slice(2, 10);

export const base = (over: Partial<Base> = {}): Base => ({
  id: newId(),
  x: 0,
  y: 0,
  w: 200,
  h: 100,
  rotation: 0,
  opacity: 1,
  ...over,
});

export const makeText = (over: Partial<TextEl> = {}): TextEl => ({
  ...base({ w: 600, h: 100 }),
  type: 'text',
  text: '',
  font: 'heading',
  size: 64,
  bold: true,
  italic: false,
  uppercase: false,
  color: 'white',
  align: 'left',
  lineHeight: 1.18,
  letterSpacing: 0,
  box: null,
  boxRadius: 0,
  padding: 0,
  ...over,
});

export const makeShape = (over: Partial<ShapeEl> = {}): ShapeEl => ({
  ...base({ w: 300, h: 300 }),
  type: 'shape',
  shape: 'rect',
  fill: 'accent',
  radius: 0,
  stroke: null,
  strokeWidth: 0,
  ...over,
});

export const makeImage = (assetId: string, over: Partial<ImageEl> = {}): ImageEl => ({
  ...base({ w: 400, h: 400 }),
  type: 'image',
  assetId,
  fit: 'cover',
  radius: 0,
  ...over,
});

export const makeLogo = (over: Partial<LogoEl> = {}): LogoEl => ({
  ...base({ w: 160, h: 160 }),
  type: 'logo',
  ...over,
});

export interface Brand {
  primary: string;
  secondary: string;
  accent: string;
  headingFont: string;
  bodyFont: string;
}

export const DEFAULT_BRAND: Brand = {
  primary: '#1877F2',
  secondary: '#0F172A',
  accent: '#F59E0B',
  headingFont: 'Inter',
  bodyFont: 'Inter',
};

/** The real colour for a fill: a hex value as is, a token from the brand kit. */
export function resolveFill(fill: Fill, brand: Brand): string {
  switch (fill) {
    case 'primary':
      return brand.primary;
    case 'secondary':
      return brand.secondary;
    case 'accent':
      return brand.accent;
    case 'white':
      return '#ffffff';
    case 'dark':
      return '#0f172a';
    default:
      return /^#[0-9a-f]{6}$/i.test(fill) ? fill : '#000000';
  }
}

/** White or near-black, whichever reads better on the colour. */
export function readableOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.62 ? '#0f172a' : '#ffffff';
}

const ARABIC = /[؀-ۿݐ-ݿ]/;
export const isRtl = (text: string) => ARABIC.test(text);

export const emptyDoc = (format: DesignFormat = 'square'): Doc => ({
  format,
  background: 'primary',
  elements: [],
});

/** Changes the page size, scaling every element with it, like Canva's "Resize". */
export function resizeDoc(doc: Doc, format: DesignFormat): Doc {
  const from = FORMATS[doc.format];
  const to = FORMATS[format];
  const fx = to.w / from.w;
  const fy = to.h / from.h;
  const f = Math.min(fx, fy);
  return {
    ...doc,
    format,
    elements: doc.elements.map((e) => {
      const moved = { ...e, x: e.x * fx, y: e.y * fy, w: e.w * fx, h: e.h * fy };
      if (e.type === 'text') {
        return {
          ...moved,
          size: Math.max(8, Math.round(e.size * f)),
          padding: e.padding * f,
        } as El;
      }
      if (e.type === 'shape')
        return { ...moved, radius: e.radius * f, strokeWidth: e.strokeWidth * f } as El;
      return moved as El;
    }),
  };
}

export const cloneDoc = (d: Doc): Doc => JSON.parse(JSON.stringify(d));
