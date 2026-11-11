import { ARTICLE_WORD_TARGET, ArticleContent, articleWordCount, slugify } from './content-schemas';

export interface ClaimWarning {
  type: 'number' | 'url' | 'email';
  value: string;
  message: string;
}

/** Converts Arabic-Indic digits (U+0660..U+0669 and U+06F0..U+06F9) to ASCII so numbers compare equal. */
export function normalizeDigits(text: string): string {
  let out = '';
  for (const ch of text) {
    const n = ch.codePointAt(0)!;
    if (n >= 0x660 && n <= 0x669) out += String(n - 0x660);
    else if (n >= 0x6f0 && n <= 0x6f9) out += String(n - 0x6f0);
    else out += ch;
  }
  return out;
}

/** Every string value in the content (skipping the slug, which is derived and ASCII-only). */
export function flattenStrings(value: unknown, skipKeys: string[] = ['slug']): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap((v) => flattenStrings(v, skipKeys));
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .filter(([k]) => !skipKeys.includes(k))
      .flatMap(([, v]) => flattenStrings(v, skipKeys));
  }
  return [];
}

const URL_RE = /(?:https?:\/\/|www\.)[^\s)>"'\]]+/gi;
const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const NUMBER_RE = /\d+(?:[.,:]\d+)*/g;

const cleanUrl = (u: string) =>
  u
    .toLowerCase()
    .replace(/[.,;:!?]+$/, '')
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '');
const stripSeparators = (n: string) => n.replace(/[.,]/g, '');

/**
 * Finds links, emails and numbers (dates, prices, years, times...) in generated text that do not
 * appear anywhere in the allowed corpus (verified facts, brand data, the user's own instructions).
 * These are the claims most likely to be invented, so a human must check them.
 */
export function findUnsupportedClaims(content: unknown, allowedParts: string[]): ClaimWarning[] {
  const corpus = normalizeDigits(allowedParts.join('\n')).toLowerCase();
  const corpusUrls = new Set((corpus.match(URL_RE) ?? []).map(cleanUrl));
  const corpusNoUrls = corpus.replace(URL_RE, ' ');
  const corpusEmails = new Set(corpusNoUrls.match(EMAIL_RE) ?? []);
  const corpusNumbers = new Set(corpusNoUrls.replace(EMAIL_RE, ' ').match(NUMBER_RE) ?? []);
  const corpusPlain = new Set([...corpusNumbers].map(stripSeparators));

  const text = normalizeDigits(flattenStrings(content).join('\n')).toLowerCase();
  const warnings: ClaimWarning[] = [];
  const seen = new Set<string>();
  const add = (w: ClaimWarning) => {
    const key = `${w.type}|${w.value}`;
    if (!seen.has(key)) {
      seen.add(key);
      warnings.push(w);
    }
  };

  for (const url of text.match(URL_RE) ?? []) {
    const norm = cleanUrl(url);
    // Allowed when it matches a known link, or is a path under a known link/domain given in the facts.
    const known = [...corpusUrls].some((c) => c === norm || norm.startsWith(`${c}/`));
    if (!known && !corpus.includes(norm)) {
      const shown = url.replace(/[.,;:!?]+$/, ''); // do not report sentence punctuation as part of the link
      add({
        type: 'url',
        value: shown,
        message: `The link "${shown}" is not in the verified facts.`,
      });
    }
  }
  const noUrls = text.replace(URL_RE, ' ');
  for (const email of noUrls.match(EMAIL_RE) ?? []) {
    if (!corpusEmails.has(email) && !corpus.includes(email)) {
      add({
        type: 'email',
        value: email,
        message: `The email "${email}" is not in the verified facts.`,
      });
    }
  }
  const noEmails = noUrls.replace(EMAIL_RE, ' ');
  for (const num of noEmails.match(NUMBER_RE) ?? []) {
    const plain = stripSeparators(num);
    if (plain.length < 2) continue; // single digits ("5 steps", "1 March") are too common to flag
    if (corpusNumbers.has(num) || corpusPlain.has(plain)) continue;
    add({
      type: 'number',
      value: num,
      message: `The number or date "${num}" is not in the verified facts.`,
    });
  }
  return warnings;
}

export interface SeoCheck {
  id: string;
  ok: boolean;
  message: string;
}

/** Deterministic on-page SEO checks (no AI involved). */
export function seoChecks(
  a: ArticleContent,
  opts: { primaryKeyword?: string; length: 'short' | 'medium' | 'long' },
): SeoCheck[] {
  const checks: SeoCheck[] = [];
  const t = a.seoTitle.length;
  checks.push({
    id: 'title-length',
    ok: t >= 30 && t <= 60,
    message: `SEO title is ${t} characters (aim for 30 to 60).`,
  });
  const m = a.metaDescription.length;
  checks.push({
    id: 'meta-length',
    ok: m >= 70 && m <= 160,
    message: `Meta description is ${m} characters (aim for 70 to 160).`,
  });
  checks.push({
    id: 'structure',
    ok: a.sections.length >= 2,
    message: `${a.sections.length} section(s) under the main heading (aim for at least 2).`,
  });

  const words = articleWordCount(a);
  const target = ARTICLE_WORD_TARGET[opts.length];
  checks.push({
    id: 'word-count',
    ok: words >= target * 0.65 && words <= target * 1.5,
    message: `${words} words (target for a ${opts.length} article is about ${target}).`,
  });
  checks.push({
    id: 'faq',
    ok: a.faq.length > 0,
    message: a.faq.length ? `${a.faq.length} FAQ item(s).` : 'No FAQ section.',
  });
  checks.push({
    id: 'alt-text',
    ok: a.imageAltText.length > 0,
    message: 'Featured image has alt text.',
  });

  const kw = opts.primaryKeyword?.trim().toLowerCase();
  if (kw) {
    const has = (s: string) => s.toLowerCase().includes(kw);
    checks.push({
      id: 'keyword-title',
      ok: has(a.seoTitle),
      message: `Primary keyword "${opts.primaryKeyword}" in the SEO title.`,
    });
    checks.push({
      id: 'keyword-meta',
      ok: has(a.metaDescription),
      message: 'Primary keyword in the meta description.',
    });
    checks.push({
      id: 'keyword-h1',
      ok: has(a.h1),
      message: 'Primary keyword in the main heading (H1).',
    });
    checks.push({
      id: 'keyword-intro',
      ok: has(a.introduction),
      message: 'Primary keyword in the introduction.',
    });
    const kwSlug = slugify(kw);
    if (kwSlug)
      checks.push({
        id: 'keyword-slug',
        ok: a.slug.includes(kwSlug),
        message: 'Primary keyword in the URL slug.',
      });
  }
  return checks;
}
