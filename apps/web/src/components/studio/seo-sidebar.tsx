'use client';

import { ReactNode, useMemo, useState } from 'react';
import { ArticleContent, SeoCheck } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/lib/i18n/messages';
import { articleJsonLd, jsonLdScripts } from '@/lib/seo-schema';

/** Like Rank Math: checks are grouped by what they are about. */
const GROUPS: { id: 'basic' | 'additional' | 'title' | 'content' | 'geo'; ids: string[] }[] = [
  {
    id: 'basic',
    ids: [
      'keyword-title',
      'keyword-meta',
      'keyword-slug',
      'keyword-intro',
      'keyword-density',
      'word-count',
      'meta-length',
    ],
  },
  {
    id: 'additional',
    ids: [
      'keyword-h1',
      'keyword-subheading',
      'alt-text',
      'internal-links',
      'structured-data',
      'images',
      'images-alt',
      'faq',
      'slug-length',
      'structure',
    ],
  },
  { id: 'title', ids: ['title-length', 'heading-length', 'heading-unique'] },
  { id: 'content', ids: ['sentence-length', 'paragraph-length'] },
  // Being found and quoted by AI answer engines.
  { id: 'geo', ids: ['geo-answer', 'geo-questions', 'geo-faq-concise', 'geo-citations'] },
];

const tone = (score: number) =>
  score >= 80
    ? { ring: 'text-green-600', bg: 'bg-green-50', label: 'seo.good' as const }
    : score >= 55
      ? { ring: 'text-amber-500', bg: 'bg-amber-50', label: 'seo.okay' as const }
      : { ring: 'text-red-500', bg: 'bg-red-50', label: 'seo.weak' as const };

/** A bar that fills as the text grows, green inside the good range, amber outside it. */
function LengthBar({ n, min, max }: { n: number; min: number; max: number }) {
  const pct = Math.min(100, Math.round((n / max) * 100));
  const good = n >= min && n <= max;
  return (
    <div className="mt-1 flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
        <div
          className={`h-full ${good ? 'bg-green-500' : 'bg-amber-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-[11px] ${good ? 'text-slate-500' : 'text-amber-700'}`}>
        {n}/{max}
      </span>
    </div>
  );
}

/** The text with the focus keyword in bold, as search engines show matches. */
function withKeyword(text: string, keyword: string): ReactNode {
  const kw = keyword.trim();
  if (!kw) return text;
  const i = text.toLowerCase().indexOf(kw.toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <strong>{text.slice(i, i + kw.length)}</strong>
      {text.slice(i + kw.length)}
    </>
  );
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/**
 * The SEO panel beside the article, in the style of Rank Math: a live score, the focus keyword, a search
 * preview with an editable snippet, and the checks grouped by topic. It updates as the text is edited.
 */
export function SeoSidebar({
  article,
  onChange,
  keyword,
  onKeyword,
  checks,
  score,
  siteName,
  language,
  disabled,
  live,
}: {
  article: ArticleContent;
  onChange: (a: ArticleContent) => void;
  keyword: string;
  onKeyword: (k: string) => void;
  checks: SeoCheck[];
  score: number;
  siteName: string;
  language: string;
  disabled?: boolean;
  /** The score is for unsaved edits. */
  live: boolean;
}) {
  const { t } = useI18n();
  const [mobile, setMobile] = useState(false);
  const [copied, setCopied] = useState(false);
  const tn = tone(score);

  const describe = (c: SeoCheck) => {
    const params: Record<string, string | number> = { ...(c.params ?? {}) };
    if (c.id === 'word-count' && typeof params.length === 'string') {
      params.length = t(`len.${params.length}` as MessageKey).toLowerCase();
    }
    return t(`seo.${c.id}` as MessageKey, params);
  };

  const grouped = GROUPS.map((g) => ({
    ...g,
    items: checks.filter((c) => g.ids.includes(c.id)),
  }));
  const known = new Set(GROUPS.flatMap((g) => g.ids));
  const extra = checks.filter((c) => !known.has(c.id));
  if (extra.length) grouped[1].items.push(...extra);

  const script = useMemo(
    () => jsonLdScripts(articleJsonLd(article, { siteName, language })),
    [article, siteName, language],
  );
  async function copy() {
    try {
      await navigator.clipboard.writeText(script);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const set = (patch: Partial<ArticleContent>) => onChange({ ...article, ...patch });
  const host = siteName.trim()
    ? `${siteName.trim().toLowerCase().replace(/\s+/g, '')}.com`
    : 'yourwebsite.com';

  return (
    <div className="space-y-4">
      <section className="card p-4">
        <div className="flex items-center gap-3">
          <div
            className={`relative flex h-16 w-16 shrink-0 items-center justify-center ${tn.ring}`}
            role="img"
            aria-label={t('seo.scoreLabel', { n: score })}
          >
            <svg viewBox="0 0 36 36" className="h-16 w-16 -rotate-90">
              <circle
                cx="18"
                cy="18"
                r="15.5"
                fill="none"
                stroke="currentColor"
                strokeOpacity="0.15"
                strokeWidth="3.5"
              />
              <circle
                cx="18"
                cy="18"
                r="15.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeDasharray={`${(score / 100) * 97.4} 97.4`}
              />
            </svg>
            <span className="absolute text-lg font-bold">{score}</span>
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-base font-semibold">SEO</h2>
            <p className="text-xs font-semibold text-slate-600">{t(tn.label)}</p>
            <p className="text-[11px] text-slate-400">
              {live ? t('rm.unsaved') : t('det.seoBased')}
            </p>
          </div>
        </div>

        <label className="mt-4 block text-sm">
          <span className="font-semibold">{t('rm.focus')}</span>
          <input
            className="input mt-1"
            maxLength={80}
            disabled={disabled}
            dir="auto"
            placeholder={t('rm.focusPh')}
            value={keyword}
            onChange={(e) => onKeyword(e.target.value)}
          />
          <span className="mt-1 block text-[11px] text-slate-400">{t('rm.focusHint')}</span>
        </label>
      </section>

      <section className="card p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">{t('rm.preview')}</h3>
          <div className="flex rounded-lg bg-slate-100 p-0.5 text-[11px] font-semibold">
            {[false, true].map((m) => (
              <button
                key={String(m)}
                type="button"
                aria-pressed={mobile === m}
                onClick={() => setMobile(m)}
                className={`rounded-md px-2 py-1 ${mobile === m ? 'bg-white shadow-sm' : 'text-slate-500'}`}
              >
                {m ? t('rm.mobile') : t('rm.desktop')}
              </button>
            ))}
          </div>
        </div>
        <div
          className={`mt-3 rounded-lg border border-slate-200 bg-white p-3 ${mobile ? 'mx-auto max-w-[300px]' : ''}`}
          dir="auto"
        >
          <p className="truncate text-xs text-slate-600">
            {host} › {article.slug || '…'}
          </p>
          <p className={`mt-0.5 leading-snug text-[#1a0dab] ${mobile ? 'text-base' : 'text-lg'}`}>
            {clip(article.seoTitle, 60) || t('prev.seoTitlePh')}
          </p>
          <p className="mt-0.5 text-sm text-slate-600">
            {withKeyword(
              clip(article.metaDescription, mobile ? 120 : 160) || t('prev.metaPh'),
              keyword,
            )}
          </p>
        </div>

        <details className="mt-3" open>
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-400">
            {t('rm.editSnippet')}
          </summary>
          <div className="mt-2 space-y-3">
            <label className="block text-sm">
              <span className="font-semibold">{t('rm.seoTitle')}</span>
              <input
                className="input mt-1"
                maxLength={90}
                disabled={disabled}
                dir="auto"
                value={article.seoTitle}
                onChange={(e) => set({ seoTitle: e.target.value })}
              />
              <LengthBar n={article.seoTitle.length} min={30} max={60} />
            </label>
            <label className="block text-sm">
              <span className="font-semibold">{t('rm.permalink')}</span>
              <input
                className="input mt-1"
                maxLength={120}
                disabled={disabled}
                dir="ltr"
                value={article.slug}
                onChange={(e) => set({ slug: e.target.value })}
              />
              <span className="mt-1 block text-[11px] text-slate-400">{t('ed.slugHint')}</span>
            </label>
            <label className="block text-sm">
              <span className="font-semibold">{t('rm.metaDesc')}</span>
              <textarea
                className="input mt-1"
                rows={3}
                maxLength={220}
                disabled={disabled}
                dir="auto"
                value={article.metaDescription}
                onChange={(e) => set({ metaDescription: e.target.value })}
              />
              <LengthBar n={article.metaDescription.length} min={70} max={160} />
            </label>
          </div>
        </details>
      </section>

      {!keyword.trim() && (
        <p className="rounded-xl bg-slate-100 p-3 text-xs text-slate-600">{t('rm.noKeyword')}</p>
      )}

      <section className="card p-4">
        {grouped
          .filter((g) => g.items.length > 0)
          .map((g, i) => {
            const failing = g.items.filter((c) => !c.ok);
            const passing = g.items.filter((c) => c.ok);
            return (
              <details
                key={g.id}
                open={i === 0 || failing.length > 0}
                className={i ? 'mt-3 border-t border-line pt-3' : ''}
              >
                <summary className="flex cursor-pointer items-center justify-between gap-2 text-sm font-semibold">
                  <span>{t(`rm.group.${g.id}` as MessageKey)}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      failing.length === 0
                        ? 'bg-green-100 text-green-800'
                        : g.id === 'basic'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {t('rm.groupCount', { ok: passing.length, total: g.items.length })}
                  </span>
                </summary>
                <ul className="mt-2 space-y-1.5">
                  {[...failing, ...passing].map((c) => (
                    <li key={c.id} className="flex gap-2 text-xs">
                      <span
                        className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
                          c.ok ? 'bg-green-500' : g.id === 'basic' ? 'bg-red-500' : 'bg-amber-500'
                        }`}
                        aria-hidden
                      />
                      <span className={c.ok ? 'text-slate-600' : 'text-slate-800'}>
                        <span className="sr-only">{c.ok ? '✓ ' : '! '}</span>
                        {describe(c)}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            );
          })}
      </section>

      <section className="card p-4">
        <details>
          <summary className="cursor-pointer text-sm font-semibold">{t('seo.jsonld')}</summary>
          <p className="mt-1.5 text-xs text-muted">{t('seo.jsonldHint')}</p>
          <pre
            className="mt-2 max-h-56 overflow-auto rounded-lg bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100"
            dir="ltr"
          >
            {script}
          </pre>
          <button type="button" className="btn-ghost btn-sm mt-2" onClick={copy}>
            {copied ? t('seo.copied') : t('det.copy')}
          </button>
        </details>
      </section>
    </div>
  );
}
