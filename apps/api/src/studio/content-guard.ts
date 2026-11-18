import { stripInline } from '../common/inline';
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
  /** English text, kept for callers that show it as is. The web app translates by `id` and `params`. */
  message: string;
  /** The numbers and words the message mentions, so a translation can use them. */
  params?: Record<string, string | number>;
}

const make = (
  id: string,
  ok: boolean,
  message: string,
  params?: Record<string, string | number>,
): SeoCheck => ({ id, ok, message, ...(params ? { params } : {}) });

const round1 = (n: number) => Math.round(n * 10) / 10;

/** All the running text of an article (not headings), as separate blocks. */
function bodyBlocks(a: ArticleContent): string[] {
  const out = [a.introduction, a.conclusion];
  for (const s of a.sections) out.push(s.body, ...(s.subsections ?? []).map((x) => x.body));
  out.push(...a.faq.map((f) => f.answer));
  // Readability and keyword checks look at the words people read, not the formatting marks.
  return out.map(stripInline).filter((b) => b.trim());
}

/** Sentences, for Latin and Arabic text alike (full stop, "!", "?", Arabic question mark, line breaks). */
function sentences(blocks: string[]): string[] {
  return blocks
    .flatMap((b) => b.split(/[.!?؟…]+(?:\s+|$)|\n+/))
    .map((x) => x.trim())
    .filter((x) => x.split(/\s+/).filter(Boolean).length >= 2);
}

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

/** How often the keyword appears in the running text, and its share of all words. */
function keywordUse(blocks: string[], kw: string) {
  const text = blocks.join(' ').toLowerCase();
  let count = 0;
  for (let at = text.indexOf(kw); at !== -1; at = text.indexOf(kw, at + kw.length)) count++;
  const total = words(text);
  return { count, density: total ? round1(((count * words(kw)) / total) * 100) : 0 };
}

/** Deterministic on-page SEO checks (no AI involved). */
export function seoChecks(
  a: ArticleContent,
  opts: { primaryKeyword?: string; length: 'short' | 'medium' | 'long' },
): SeoCheck[] {
  const checks: SeoCheck[] = [];
  const t = a.seoTitle.length;
  checks.push(
    make('title-length', t >= 30 && t <= 60, `SEO title is ${t} characters (aim for 30 to 60).`, {
      n: t,
    }),
  );
  const m = a.metaDescription.length;
  checks.push(
    make(
      'meta-length',
      m >= 70 && m <= 160,
      `Meta description is ${m} characters (aim for 70 to 160).`,
      { n: m },
    ),
  );
  checks.push(
    make(
      'structure',
      a.sections.length >= 2,
      `${a.sections.length} section(s) under the main heading (aim for at least 2).`,
      { n: a.sections.length },
    ),
  );

  const wc = articleWordCount(a);
  const target = ARTICLE_WORD_TARGET[opts.length];
  checks.push(
    make(
      'word-count',
      wc >= target * 0.65 && wc <= target * 1.5,
      `${wc} words (target for a ${opts.length} article is about ${target}).`,
      { n: wc, target, length: opts.length },
    ),
  );
  checks.push(
    make(
      'faq',
      a.faq.length > 0,
      a.faq.length ? `${a.faq.length} FAQ item(s).` : 'No FAQ section.',
      { n: a.faq.length },
    ),
  );
  checks.push(make('alt-text', a.imageAltText.length > 0, 'Featured image has alt text.'));

  const kw = opts.primaryKeyword?.trim().toLowerCase();
  if (kw) {
    const has = (x: string) => x.toLowerCase().includes(kw);
    const kwp = { keyword: opts.primaryKeyword!.trim() };
    checks.push(
      make(
        'keyword-title',
        has(a.seoTitle),
        `Primary keyword "${kwp.keyword}" in the SEO title.`,
        kwp,
      ),
    );
    checks.push(
      make('keyword-meta', has(a.metaDescription), 'Primary keyword in the meta description.'),
    );
    checks.push(make('keyword-h1', has(a.h1), 'Primary keyword in the main heading (H1).'));
    checks.push(make('keyword-intro', has(a.introduction), 'Primary keyword in the introduction.'));
    const kwSlug = slugify(kw);
    if (kwSlug)
      checks.push(
        make('keyword-slug', a.slug.includes(kwSlug), 'Primary keyword in the URL slug.'),
      );
    const subs = a.sections.flatMap((s) => [
      s.heading,
      ...(s.subsections ?? []).map((x) => x.heading),
    ]);
    checks.push(
      make(
        'keyword-subheading',
        subs.some(has),
        'Primary keyword in at least one subheading (H2 or H3).',
      ),
    );
    const use = keywordUse(bodyBlocks(a), kw);
    checks.push(
      make(
        'keyword-density',
        use.density >= 0.4 && use.density <= 2.5,
        `The keyword makes up ${use.density}% of the text, ${use.count} time(s) (aim for 0.4% to 2.5%, more reads as keyword stuffing).`,
        { density: use.density, count: use.count },
      ),
    );
  }

  // ----- readability and structure
  const sent = sentences(bodyBlocks(a));
  const lens = sent.map(words);
  const avg = lens.length ? round1(lens.reduce((x, y) => x + y, 0) / lens.length) : 0;
  const longSentences = lens.filter((n) => n > 35).length;
  checks.push(
    make(
      'sentence-length',
      avg <= 22 && longSentences <= Math.max(1, Math.floor(lens.length * 0.1)),
      `Sentences average ${avg} words, ${longSentences} over 35 words (aim for an average under 22).`,
      { avg, long: longSentences },
    ),
  );

  const paragraphs = bodyBlocks(a).flatMap((b) => b.split(/\n{2,}/));
  const longest = paragraphs.reduce((n, p) => Math.max(n, words(p)), 0);
  checks.push(
    make(
      'paragraph-length',
      longest <= 160,
      `The longest paragraph has ${longest} words (aim for 160 or fewer, split long blocks).`,
      { n: longest },
    ),
  );

  const headings = [
    a.h1,
    ...a.sections.flatMap((s) => [s.heading, ...(s.subsections ?? []).map((x) => x.heading)]),
  ];
  const tooLong = headings.filter((h) => h.length > 70).length;
  checks.push(
    make(
      'heading-length',
      tooLong === 0,
      tooLong
        ? `${tooLong} heading(s) over 70 characters.`
        : 'All headings are 70 characters or fewer.',
      { n: tooLong },
    ),
  );
  const seen = new Set<string>();
  let dup = 0;
  for (const h of headings.map((x) => x.trim().toLowerCase()).filter(Boolean)) {
    if (seen.has(h)) dup++;
    seen.add(h);
  }
  checks.push(
    make(
      'heading-unique',
      dup === 0,
      dup ? `${dup} heading(s) repeat another heading.` : 'Every heading is different.',
      { n: dup },
    ),
  );

  // ----- links, address and markup
  checks.push(
    make(
      'internal-links',
      a.internalLinkSuggestions.length >= 2,
      `${a.internalLinkSuggestions.length} internal link idea(s) (aim for at least 2).`,
      { n: a.internalLinkSuggestions.length },
    ),
  );
  checks.push(
    make(
      'slug-length',
      a.slug.length > 0 && a.slug.length <= 75,
      `The URL slug is ${a.slug.length} characters (aim for 75 or fewer).`,
      { n: a.slug.length },
    ),
  );
  checks.push(
    make(
      'structured-data',
      a.structuredData.type !== 'Other',
      `Structured data type: ${a.structuredData.type}.`,
      { type: a.structuredData.type },
    ),
  );
  return checks;
}

/** 0 to 100: the share of checks that pass. */
export function seoScore(checks: SeoCheck[]): number {
  return checks.length ? Math.round((checks.filter((c) => c.ok).length / checks.length) * 100) : 0;
}
