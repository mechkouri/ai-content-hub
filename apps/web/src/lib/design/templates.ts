import type { MessageKey } from '@/lib/i18n/messages';
import {
  Brand,
  Doc,
  DesignFormat,
  El,
  FORMATS,
  isRtl,
  makeLogo,
  makeShape,
  makeText,
  readableOn,
  resolveFill,
  TextEl,
} from './doc';
import { textHeight, textWidth } from './render';

export const CATEGORIES = [
  'education',
  'recruitment',
  'event',
  'promotion',
  'news',
  'quote',
  'other',
] as const;
export type TemplateCategory = (typeof CATEGORIES)[number];

/** A template saved by an organization (stored by the API). The document is the whole design. */
export interface SavedTemplate {
  id: string;
  name: string;
  category: TemplateCategory;
  spec: Doc;
  createdAt: string;
}

type Layout = 'bold' | 'card' | 'photo' | 'split' | 'centered';
type Role = 'primary' | 'secondary' | 'accent' | 'light';

/** A template that ships with the app. Its name and sample text are translated. */
export interface BuiltInTemplate {
  id: string;
  category: Exclude<TemplateCategory, 'other'>;
  layout: Layout;
  format: DesignFormat;
  background: Role;
  hasSubline: boolean;
}

export const BUILT_IN: BuiltInTemplate[] = [
  {
    id: 'openDay',
    category: 'education',
    layout: 'bold',
    format: 'square',
    background: 'primary',
    hasSubline: false,
  },
  {
    id: 'admissions',
    category: 'education',
    layout: 'split',
    format: 'landscape',
    background: 'primary',
    hasSubline: true,
  },
  {
    id: 'scholarship',
    category: 'education',
    layout: 'centered',
    format: 'portrait',
    background: 'secondary',
    hasSubline: true,
  },
  {
    id: 'hiring',
    category: 'recruitment',
    layout: 'bold',
    format: 'square',
    background: 'secondary',
    hasSubline: true,
  },
  {
    id: 'internship',
    category: 'recruitment',
    layout: 'card',
    format: 'portrait',
    background: 'primary',
    hasSubline: true,
  },
  {
    id: 'joinTeam',
    category: 'recruitment',
    layout: 'photo',
    format: 'landscape',
    background: 'primary',
    hasSubline: false,
  },
  {
    id: 'saveDate',
    category: 'event',
    layout: 'centered',
    format: 'story',
    background: 'primary',
    hasSubline: true,
  },
  {
    id: 'webinar',
    category: 'event',
    layout: 'split',
    format: 'portrait',
    background: 'accent',
    hasSubline: true,
  },
  {
    id: 'offer',
    category: 'promotion',
    layout: 'bold',
    format: 'square',
    background: 'accent',
    hasSubline: false,
  },
  {
    id: 'launch',
    category: 'promotion',
    layout: 'card',
    format: 'square',
    background: 'secondary',
    hasSubline: true,
  },
  {
    id: 'newsUpdate',
    category: 'news',
    layout: 'card',
    format: 'landscape',
    background: 'primary',
    hasSubline: true,
  },
  {
    id: 'quoteCard',
    category: 'quote',
    layout: 'centered',
    format: 'square',
    background: 'primary',
    hasSubline: false,
  },
];

type T = (key: MessageKey, params?: Record<string, string | number>) => string;
const key = (id: string, part: string) => `tpl.${id}.${part}` as MessageKey;
export const builtInName = (b: BuiltInTemplate, t: T) => t(key(b.id, 'name'));

interface Texts {
  eyebrow: string;
  headline: string;
  subline: string;
  cta: string;
}

export const builtInTexts = (b: BuiltInTemplate, t: T): Texts => ({
  eyebrow: t(key(b.id, 'eyebrow')),
  headline: t(key(b.id, 'headline')),
  subline: b.hasSubline ? t(key(b.id, 'subline')) : '',
  cta: t(key(b.id, 'cta')),
});

/**
 * Builds the editable document for a built-in template: real text, shape and logo elements placed for the
 * chosen format, in the brand's colours. Right-to-left text mirrors the layout.
 */
export function buildBuiltIn(b: BuiltInTemplate, texts: Texts, brand: Brand): Doc {
  const { w: W, h: H } = FORMATS[b.format];
  const rtl = isRtl(`${texts.headline} ${texts.eyebrow} ${texts.cta}`);
  const base = Math.min(W, H);
  const tall = H / W > 1.2;
  const pad = Math.round(base * 0.07);
  const startAlign: TextEl['align'] = rtl ? 'right' : 'left';
  const mirrorX = (x: number, w: number) => (rtl ? W - x - w : x);
  const inkOn = (role: Role | 'white'): 'white' | 'dark' =>
    readableOn(role === 'light' || role === 'white' ? '#ffffff' : resolveFill(role, brand)) ===
    '#ffffff'
      ? 'white'
      : 'dark';

  // The colour of the page, and of labels and buttons, which must stand out from it.
  const pageRole = b.background;
  const highlight: 'primary' | 'secondary' | 'accent' =
    pageRole === 'accent' ? 'secondary' : pageRole === 'light' ? 'primary' : 'accent';

  const elements: El[] = [];
  let background = pageRole === 'light' ? 'white' : pageRole;
  let ink: string;
  let region = {
    x: pad,
    y: pad,
    w: W - pad * 2,
    h: H - pad * 2,
    anchor: 'center' as 'center' | 'bottom',
  };
  let align: TextEl['align'] = startAlign;
  const logoSize = Math.round(base * 0.13);

  if (b.layout === 'bold') {
    ink = inkOn(pageRole);
    elements.push(
      makeShape({
        shape: 'ellipse',
        fill: highlight,
        opacity: 0.22,
        w: base * 0.84,
        h: base * 0.84,
        x: rtl ? -base * 0.4 : W - base * 0.44,
        y: -base * 0.38,
      }),
      makeLogo({ x: mirrorX(pad, logoSize), y: Math.round(pad * 0.8), w: logoSize, h: logoSize }),
    );
    const top = Math.round(pad * 0.8) + logoSize + Math.round(pad * 0.3);
    region = { x: pad, y: top, w: W - pad * 2, h: H - top - pad, anchor: 'center' };
  } else if (b.layout === 'card') {
    const band = Math.round(H * (tall ? 0.15 : 0.22));
    ink = pageRole === 'secondary' ? 'dark' : 'secondary';
    background = 'white';
    const bandRole = pageRole === 'light' ? 'primary' : pageRole;
    elements.push(
      makeShape({ shape: 'rect', fill: bandRole, x: 0, y: 0, w: W, h: band }),
      makeLogo({
        x: mirrorX(pad, logoSize),
        y: Math.round((band - logoSize) / 2),
        w: logoSize,
        h: logoSize,
      }),
    );
    region = {
      x: pad,
      y: band + Math.round(pad * 0.6),
      w: W - pad * 2,
      h: H - band - Math.round(pad * 1.6),
      anchor: 'center',
    };
  } else if (b.layout === 'photo') {
    background = pageRole === 'light' ? 'primary' : pageRole;
    ink = 'white';
    elements.push(
      makeShape({
        shape: 'gradient',
        fill: 'dark',
        x: 0,
        y: Math.round(H * 0.2),
        w: W,
        h: H - Math.round(H * 0.2),
        opacity: 0.85,
      }),
      makeLogo({ x: mirrorX(pad, logoSize), y: Math.round(pad * 0.8), w: logoSize, h: logoSize }),
    );
    region = { x: pad, y: pad, w: W - pad * 2, h: H - pad * 2, anchor: 'bottom' };
  } else if (b.layout === 'split') {
    background = 'white';
    ink = pageRole === 'secondary' ? 'dark' : 'secondary';
    const panelRole = pageRole === 'light' ? 'primary' : pageRole;
    if (tall) {
      const ph = Math.round(H * 0.3);
      elements.push(
        makeShape({ shape: 'rect', fill: panelRole, x: 0, y: 0, w: W, h: ph }),
        makeLogo({
          x: mirrorX(pad, logoSize),
          y: Math.round((ph - logoSize) / 2),
          w: logoSize,
          h: logoSize,
        }),
      );
      region = { x: pad, y: ph + pad, w: W - pad * 2, h: H - ph - pad * 2, anchor: 'center' };
    } else {
      const pw = Math.round(W * 0.36);
      elements.push(
        makeShape({ shape: 'rect', fill: panelRole, x: rtl ? W - pw : 0, y: 0, w: pw, h: H }),
        makeLogo({
          x: (rtl ? W - pw : 0) + Math.round((pw - logoSize) / 2),
          y: Math.round((H - logoSize) / 2),
          w: logoSize,
          h: logoSize,
        }),
      );
      region = {
        x: rtl ? pad : pw + pad,
        y: pad,
        w: W - pw - pad * 2,
        h: H - pad * 2,
        anchor: 'center',
      };
    }
  } else {
    // centered
    ink = inkOn(pageRole);
    align = 'center';
    elements.push(
      makeLogo({
        x: Math.round((W - logoSize) / 2),
        y: Math.round(pad * 0.8),
        w: logoSize,
        h: logoSize,
      }),
    );
    const top = Math.round(pad * 0.8) + logoSize + Math.round(pad * 0.4);
    region = { x: pad, y: top, w: W - pad * 2, h: H - top - pad, anchor: 'center' };
  }

  // ----- the text block: label, headline, subline, button
  const gap = Math.round(base * 0.025);
  const eSize = Math.round(base * 0.026);
  const cSize = Math.round(base * 0.032);
  const pill = (text: string, size: number, padding: number): TextEl => {
    const el = makeText({
      text,
      font: 'body',
      size,
      bold: true,
      uppercase: size === eSize,
      color: highlight === 'accent' ? 'dark' : 'white',
      align: 'center',
      box: highlight,
      padding,
      lineHeight: 1.1,
    });
    el.w = Math.min(region.w, textWidth(el, brand) + 2);
    el.h = textHeight(el, brand);
    el.boxRadius = el.h / 2;
    return el;
  };

  const parts: { el: TextEl; gapBefore: number }[] = [];
  const eyebrow = texts.eyebrow.trim()
    ? pill(texts.eyebrow.trim(), eSize, Math.round(eSize * 0.7))
    : null;
  if (eyebrow) parts.push({ el: eyebrow, gapBefore: 0 });

  const cta = texts.cta.trim() ? pill(texts.cta.trim(), cSize, Math.round(cSize * 0.8)) : null;
  const sub = texts.subline.trim();
  const reserved =
    (eyebrow ? eyebrow.h + gap : 0) + (cta ? cta.h + gap * 1.6 : 0) + (sub ? base * 0.16 + gap : 0);
  const room = Math.max(80, region.h - reserved);
  const headline = makeText({
    text: texts.headline.trim() || ' ',
    font: 'heading',
    color: ink,
    align,
    w: region.w,
  });
  for (
    let size = Math.round(base * (tall ? 0.105 : 0.092));
    size >= Math.round(base * 0.038);
    size -= 2
  ) {
    headline.size = size;
    headline.h = textHeight(headline, brand);
    if (headline.h <= room) break;
  }
  parts.push({ el: headline, gapBefore: eyebrow ? gap : 0 });
  if (sub) {
    const s = makeText({
      text: sub,
      font: 'body',
      bold: false,
      color: ink,
      align,
      w: region.w,
      opacity: 0.9,
      lineHeight: 1.3,
    });
    s.size = Math.round(base * 0.04);
    s.h = textHeight(s, brand);
    while (s.h > base * 0.2 && s.size > base * 0.025) {
      s.size -= 2;
      s.h = textHeight(s, brand);
    }
    parts.push({ el: s, gapBefore: gap });
  }
  if (cta) parts.push({ el: cta, gapBefore: Math.round(gap * 1.6) });

  const total = parts.reduce((n, p) => n + p.el.h + p.gapBefore, 0);
  let y =
    region.anchor === 'bottom' ? region.y + region.h - total : region.y + (region.h - total) / 2;
  y = Math.max(region.y, y);
  for (const p of parts) {
    y += p.gapBefore;
    p.el.y = Math.round(y);
    const pillLike = p.el.box !== null;
    if (pillLike) {
      p.el.x = Math.round(
        align === 'center'
          ? region.x + (region.w - p.el.w) / 2
          : rtl
            ? region.x + region.w - p.el.w
            : region.x,
      );
    } else {
      p.el.x = region.x;
      p.el.w = region.w;
    }
    y += p.el.h;
    elements.push(p.el);
  }

  return { format: b.format, background, elements };
}
