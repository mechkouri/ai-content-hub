import { z } from 'zod';

export const LANGUAGES = ['fr', 'ar', 'en'] as const;
export const STYLES = [
  'informative',
  'journalistic',
  'storytelling',
  'promotional',
  'formal',
  'conversational',
] as const;
export const TONES = ['professional', 'friendly', 'inspiring', 'urgent', 'neutral'] as const;
export const LENGTHS = ['short', 'medium', 'long'] as const;
export const KINDS = ['ARTICLE', 'INSTAGRAM', 'FACEBOOK', 'LINKEDIN'] as const;
export type Kind = (typeof KINDS)[number];
export type Language = (typeof LANGUAGES)[number];

/** What the user can choose when generating content. */
export const optionsSchema = z.object({
  language: z.enum(LANGUAGES).optional(),
  style: z.enum(STYLES).default('informative'),
  tone: z.enum(TONES).default('professional'),
  audience: z.string().trim().max(150).optional(),
  length: z.enum(LENGTHS).default('medium'),
  primaryKeyword: z.string().trim().max(80).optional(),
  instructions: z.string().trim().max(500).optional(),
});
export type GenerationOptions = z.infer<typeof optionsSchema>;

const str = (max: number) => z.string().trim().min(1).max(max);

/** Normalizes "hello world", "#Hello", "##hello" into "#helloworld" and validates the result. */
const hashtag = z
  .string()
  .transform(
    (h) =>
      `#${h
        .trim()
        .replace(/^#+/, '')
        .replace(/[\s#]+/g, '')}`,
  )
  .refine((h) => /^#[\p{L}\p{N}_]{2,40}$/u.test(h), 'Invalid hashtag');

const imageIdea = z.object({ brief: str(400), altText: str(200) });

// ---------- website article ----------
export const STRUCTURED_DATA_TYPES = [
  'Article',
  'NewsArticle',
  'Event',
  'FAQPage',
  'EducationalOccupationalProgram',
  'JobPosting',
  'Other',
] as const;

export const articleSchema = z.object({
  seoTitle: str(90),
  metaDescription: str(220),
  slug: z.string().trim().min(1).max(120),
  h1: str(160),
  excerpt: str(400),
  introduction: str(2500),
  sections: z
    .array(
      z.object({
        heading: str(160),
        body: str(4500),
        subsections: z
          .array(z.object({ heading: str(160), body: str(3500) }))
          .max(5)
          .optional(),
      }),
    )
    .min(1)
    .max(10),
  conclusion: str(2500),
  faq: z.array(z.object({ question: str(220), answer: str(900) })).max(8),
  internalLinkSuggestions: z
    .array(z.object({ anchorText: str(100), suggestedTopic: str(200) }))
    .max(6),
  featuredImageBrief: str(500),
  imageAltText: str(220),
  structuredData: z.object({
    type: z.enum(STRUCTURED_DATA_TYPES).catch('Article'),
    notes: z.string().trim().max(500).optional(),
  }),
});
export type ArticleContent = z.infer<typeof articleSchema>;

// ---------- Instagram ----------
export const instagramSchema = z.object({
  caption: str(2200),
  carousel: z.array(z.object({ headline: str(90), body: str(260) })).max(10),
  hashtags: z.array(hashtag).max(15),
  cta: str(180),
  imageBrief: str(500),
  altText: str(220),
});
export type InstagramContent = z.infer<typeof instagramSchema>;

// ---------- Facebook ----------
export const facebookSchema = z.object({
  postText: str(2500),
  cta: str(180),
  /** An official link, copied from the verified facts (checked by the guard). */
  link: z.string().trim().max(500).nullable().optional(),
  images: z.array(imageIdea).max(10),
  hashtags: z.array(hashtag).max(5),
});
export type FacebookContent = z.infer<typeof facebookSchema>;

// ---------- LinkedIn ----------
export const linkedinSchema = z.object({
  postText: str(3000),
  cta: str(180),
  imageMode: z.enum(['text', 'image', 'multi_image']).catch('text'),
  images: z.array(imageIdea).max(9),
  hashtags: z.array(hashtag).max(5),
});
export type LinkedinContent = z.infer<typeof linkedinSchema>;

const schemas = {
  ARTICLE: articleSchema,
  INSTAGRAM: instagramSchema,
  FACEBOOK: facebookSchema,
  LINKEDIN: linkedinSchema,
} as const;

export const schemaFor = (kind: Kind) => schemas[kind];

/** Wrapper the model must return: which numbered facts it used, plus the content itself. */
export const generationEnvelope = <K extends Kind>(kind: K) =>
  z.object({
    usedFacts: z.array(z.string().max(12)).max(80).optional().default([]),
    content: schemas[kind],
  });

// ---------- post-processing ----------

export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
}

/** Slugs must be plain ASCII (also for Arabic articles). Falls back to the title or a generic slug. */
export function sanitizeSlug(slug: string, fallbackTitle: string): string {
  return slugify(slug) || slugify(fallbackTitle) || 'article';
}

/** Keeps the image fields consistent with the chosen LinkedIn format. */
export function normalizeLinkedin(c: LinkedinContent): LinkedinContent {
  if (c.imageMode === 'text') return { ...c, images: [] };
  if (c.imageMode === 'image')
    return { ...c, images: c.images.slice(0, 1), imageMode: c.images.length ? 'image' : 'text' };
  return c.images.length >= 2 ? c : { ...c, imageMode: c.images.length === 1 ? 'image' : 'text' };
}

export const wordCount = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0);

/** Words in the readable body of an article (introduction, sections, conclusion, FAQ). */
export function articleWordCount(a: ArticleContent): number {
  const parts = [a.introduction, a.conclusion];
  for (const s of a.sections) {
    parts.push(s.body, ...(s.subsections ?? []).map((x) => x.body));
  }
  parts.push(...a.faq.map((f) => f.answer));
  return parts.reduce((n, p) => n + wordCount(p), 0);
}

export const ARTICLE_WORD_TARGET: Record<(typeof LENGTHS)[number], number> = {
  short: 350,
  medium: 700,
  long: 1200,
};

export function titleOf(kind: Kind, content: any): string {
  const raw: string =
    kind === 'ARTICLE' ? content.h1 : kind === 'INSTAGRAM' ? content.caption : content.postText;
  const first = String(raw ?? '')
    .split('\n')[0]
    .trim();
  return first.length > 120 ? `${first.slice(0, 117)}…` : first || 'Untitled';
}
