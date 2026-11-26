'use client';

import { useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/lib/i18n/messages';
import type { SiteReport as Report } from '@/lib/seo-plan';

const TONE = {
  1: 'bg-red-100 text-red-800',
  2: 'bg-amber-100 text-amber-800',
  3: 'bg-slate-100 text-slate-600',
} as const;

function PageList({ urls }: { urls: string[] }) {
  return (
    <ul className="mt-1 space-y-0.5">
      {urls.map((u) => (
        <li key={u} className="break-all text-xs text-slate-600" dir="ltr">
          <a href={u} target="_blank" rel="noreferrer noopener" className="hover:underline">
            {u}
          </a>
        </li>
      ))}
    </ul>
  );
}

/** What is wrong across the pages that were checked, most important first. */
export function SiteReport({ report }: { report: Report }) {
  const { t } = useI18n();
  return (
    <section className="card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold">{t('strat.siteReport')}</h2>
          <p className="text-xs text-muted">
            {t('strat.pagesChecked', { n: report.pages.length })}
          </p>
        </div>
        <p className="text-3xl font-bold">
          {report.score}
          <span className="text-sm font-normal text-muted">/100</span>
        </p>
      </div>

      {!report.hasSitemap && (
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          {t('strat.noSitemap')}
        </p>
      )}

      {report.problems.length === 0 && report.duplicateTitles.length === 0 ? (
        <p className="mt-3 text-sm text-ok-ink">{t('strat.siteAllGood')}</p>
      ) : (
        <ol className="mt-3 divide-y divide-line">
          {report.problems.map((p) => (
            <li key={p.id} className="py-2">
              <details>
                <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
                  <span className={`rounded-full px-2 text-[11px] font-semibold ${TONE[p.impact]}`}>
                    {t(`site.impact.${p.impact}` as MessageKey)}
                  </span>
                  <span className="font-semibold">{t(`site.name.${p.id}` as MessageKey)}</span>
                  <span className="text-muted">{t('strat.onPages', { n: p.pages.length })}</span>
                </summary>
                <PageList urls={p.pages} />
              </details>
            </li>
          ))}
          {report.duplicateTitles.map((d) => (
            <li key={d.title} className="py-2">
              <details>
                <summary className="cursor-pointer text-sm">
                  <span className="font-semibold">{t('strat.sameTitle')}</span>{' '}
                  <span className="text-muted" dir="auto">
                    {d.title}
                  </span>
                </summary>
                <PageList urls={d.pages} />
              </details>
            </li>
          ))}
        </ol>
      )}

      {report.unreadable.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-semibold">
            {t('strat.unreadable', { n: report.unreadable.length })}
          </summary>
          <PageList urls={report.unreadable} />
        </details>
      )}
    </section>
  );
}
