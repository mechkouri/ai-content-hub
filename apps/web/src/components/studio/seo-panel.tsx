'use client';

import { useMemo, useState } from 'react';
import { ArticleContent, SeoCheck } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/lib/i18n/messages';
import { articleJsonLd, jsonLdScripts } from '@/lib/seo-schema';

const tone = (score: number) =>
  score >= 80
    ? { ring: 'text-green-600', label: 'seo.good' as const }
    : score >= 55
      ? { ring: 'text-amber-500', label: 'seo.okay' as const }
      : { ring: 'text-red-500', label: 'seo.weak' as const };

/** The SEO score, what to fix first, and the structured data to paste into the page. */
export function SeoPanel({
  checks,
  score,
  article,
  siteName,
  language,
}: {
  checks: SeoCheck[];
  score: number;
  article: ArticleContent;
  siteName: string;
  language: string;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const tn = tone(score);
  const failing = checks.filter((c) => !c.ok);
  const passing = checks.filter((c) => c.ok);

  const describe = (c: SeoCheck) => {
    const params: Record<string, string | number> = { ...(c.params ?? {}) };
    if (c.id === 'word-count' && typeof params.length === 'string') {
      params.length = t(`len.${params.length}` as MessageKey).toLowerCase();
    }
    return t(`seo.${c.id}` as MessageKey, params);
  };

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

  const row = (c: SeoCheck) => (
    <li key={c.id} className="flex gap-2 text-xs">
      <span className={c.ok ? 'text-green-600' : 'text-amber-600'} aria-hidden>
        {c.ok ? '✓' : '!'}
      </span>
      <span className={c.ok ? 'text-slate-600' : 'text-slate-800'}>{describe(c)}</span>
    </li>
  );

  return (
    <section className="card p-4">
      <div className="flex items-center gap-3">
        <div
          className={`relative flex h-14 w-14 shrink-0 items-center justify-center ${tn.ring}`}
          role="img"
          aria-label={t('seo.scoreLabel', { n: score })}
        >
          <svg viewBox="0 0 36 36" className="h-14 w-14 -rotate-90">
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
          <span className="absolute text-sm font-bold">{score}</span>
        </div>
        <div className="min-w-0">
          <h2 className="font-display text-base font-semibold">{t('det.seo')}</h2>
          <p className="text-xs font-semibold text-slate-600">{t(tn.label)}</p>
          <p className="text-[11px] text-slate-400">{t('det.seoBased')}</p>
        </div>
      </div>

      {failing.length > 0 && (
        <>
          <h3 className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            {t('seo.toFix', { n: failing.length })}
          </h3>
          <ul className="mt-1.5 space-y-1.5">{failing.map(row)}</ul>
        </>
      )}
      {passing.length > 0 && (
        <details className="mt-3" open={failing.length === 0}>
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-400">
            {t('seo.passed', { n: passing.length })}
          </summary>
          <ul className="mt-1.5 space-y-1.5">{passing.map(row)}</ul>
        </details>
      )}

      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-400">
          {t('seo.jsonld')}
        </summary>
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
  );
}
