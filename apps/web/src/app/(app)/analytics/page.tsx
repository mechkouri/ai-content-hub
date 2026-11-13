'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AnalyticsOverview, apiFetch, LANG_LABELS } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { describeError } from '@/lib/errors';
import { useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/lib/i18n/messages';

const RANGES = [7, 30, 90] as const;
const KIND_ICON: Record<string, string> = {
  ARTICLE: '📰',
  INSTAGRAM: '📸',
  FACEBOOK: '👍',
  LINKEDIN: '💼',
};

type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

/** 45 min, 3.5 h, 2 days: whichever reads best. */
function duration(minutes: number, t: Translate): string {
  if (minutes < 60) return t('duration.min', { n: Math.max(1, minutes) });
  const hours = minutes / 60;
  if (hours < 48) return t('duration.h', { n: Math.round(hours * 10) / 10 });
  return t('duration.days', { n: Math.round(hours / 24) });
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <p className="eyebrow">{label}</p>
      <p className="mt-1 font-display text-3xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

/** Bars for posts per day. The tallest bar sets the scale; every day has a title with its numbers. */
function DayChart({ days }: { days: AnalyticsOverview['byDay'] }) {
  const { t } = useI18n();
  const max = Math.max(1, ...days.map((d) => d.published + d.failed));
  const total = days.reduce((n, d) => n + d.published + d.failed, 0);
  return (
    <div>
      <div
        className="flex h-40 items-end gap-px sm:gap-0.5"
        role="img"
        aria-label={t('analytics.chartLabel', { days: days.length, total })}
      >
        {days.map((d) => (
          <div
            key={d.date}
            className="flex h-full min-w-0 flex-1 flex-col justify-end"
            title={t('analytics.dayTitle', {
              date: d.date,
              published: d.published,
              failed: d.failed,
            })}
          >
            <div className="bg-danger" style={{ height: `${(d.failed / max) * 100}%` }} />
            <div className="bg-brand" style={{ height: `${(d.published / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-slate-400">
        <span>{days[0].date}</span>
        <span>{days[days.length - 1].date}</span>
      </div>
      <p className="mt-2 flex gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-brand" /> {t('analytics.legendPublished')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-danger" /> {t('analytics.legendFailed')}
        </span>
      </p>
    </div>
  );
}

export default function AnalyticsPage() {
  const { currentOrgId } = useApp();
  const { t, dateLocale } = useI18n();
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!currentOrgId) return;
    let live = true;
    setData(null);
    setError('');
    apiFetch<AnalyticsOverview>(`/organizations/${currentOrgId}/analytics?days=${days}`)
      .then((d) => live && setData(d))
      .catch((e) => live && setError(describeError(e)));
    return () => {
      live = false;
    };
  }, [currentOrgId, days]);

  const pipelineTotal = data
    ? data.pipeline.draft +
      data.pipeline.inReview +
      data.pipeline.changesRequested +
      data.pipeline.approved
    : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">{t('nav.analytics')}</h1>
          <p className="text-sm text-muted">{t('analytics.subtitle')}</p>
        </div>
        <div className="flex gap-2" role="group" aria-label={t('analytics.period')}>
          {RANGES.map((r) => (
            <button
              key={r}
              className={days === r ? 'btn-primary' : 'btn-ghost'}
              onClick={() => setDays(r)}
              aria-pressed={days === r}
            >
              {t('analytics.days', { n: r })}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-danger-soft p-3 text-sm text-danger-ink">
          {error}
        </p>
      )}
      {!data && !error && <p className="text-sm text-muted">{t('common.loading')}</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              label={t('analytics.created')}
              value={String(data.totals.created)}
              hint={t('analytics.createdHint', { n: data.range.days })}
            />
            <Kpi
              label={t('analytics.published')}
              value={String(data.totals.published)}
              hint={
                data.totals.queued ? t('analytics.waiting', { n: data.totals.queued }) : undefined
              }
            />
            <Kpi
              label={t('analytics.successRate')}
              value={data.successRate === null ? '—' : `${data.successRate}%`}
              hint={
                data.totals.failed
                  ? t('analytics.failedHint', { n: data.totals.failed })
                  : t('analytics.noFailures')
              }
            />
            <Kpi
              label={t('analytics.approveTime')}
              value={
                data.approval.avgMinutes === null ? '—' : duration(data.approval.avgMinutes, t)
              }
              hint={
                data.approval.count
                  ? t('analytics.approvedCount', { n: data.approval.count })
                  : t('analytics.nothingApproved')
              }
            />
          </div>

          <section className="card p-5">
            <h2 className="mb-3 font-display text-base font-semibold">{t('analytics.perDay')}</h2>
            {data.totals.published + data.totals.failed === 0 ? (
              <p className="py-8 text-center text-sm text-muted">
                {t('analytics.nothingPublished')}
              </p>
            ) : (
              <DayChart days={data.byDay} />
            )}
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="card p-5">
              <h2 className="mb-3 font-display text-base font-semibold">
                {t('analytics.byChannel')}
              </h2>
              {data.byChannel.length === 0 ? (
                <p className="text-sm text-muted">{t('analytics.noPosts')}</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-start text-xs text-muted">
                      <th className="pb-1.5 text-start font-semibold">
                        {t('analytics.colChannel')}
                      </th>
                      <th className="pb-1.5 text-end font-semibold">
                        {t('analytics.colPublished')}
                      </th>
                      <th className="pb-1.5 text-end font-semibold">{t('analytics.colFailed')}</th>
                      <th className="pb-1.5 text-end font-semibold">{t('analytics.colWaiting')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.byChannel.map((c) => (
                      <tr key={c.channelId}>
                        <td className="py-2">
                          <p className="font-semibold" dir="auto">
                            {c.name}
                          </p>
                          {c.provider && (
                            <p className="text-xs text-slate-400">{t(`provider.${c.provider}`)}</p>
                          )}
                        </td>
                        <td className="py-2 text-end tabular-nums">{c.published}</td>
                        <td className="py-2 text-end tabular-nums">{c.failed || '—'}</td>
                        <td className="py-2 text-end tabular-nums">{c.queued || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="card p-5">
              <h2 className="mb-1 font-display text-base font-semibold">
                {t('analytics.pipeline')}
              </h2>
              <p className="mb-3 text-xs text-muted">{t('analytics.pipelineHint')}</p>
              {pipelineTotal === 0 ? (
                <p className="text-sm text-muted">{t('analytics.noContent')}</p>
              ) : (
                <ul className="space-y-2.5">
                  {(
                    [
                      ['stage.draft', data.pipeline.draft, 'bg-slate-300'],
                      ['stage.inReview', data.pipeline.inReview, 'bg-brand'],
                      ['stage.changes', data.pipeline.changesRequested, 'bg-warn'],
                      ['stage.approved', data.pipeline.approved, 'bg-ok'],
                    ] as const
                  ).map(([label, n, color]) => (
                    <li key={label}>
                      <div className="flex justify-between text-sm">
                        <span>{t(label)}</span>
                        <span className="tabular-nums">{n}</span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-sub">
                        <div
                          className={`h-full rounded-full ${color}`}
                          style={{ width: `${(n / pipelineTotal) * 100}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="card p-5">
              <h2 className="mb-3 font-display text-base font-semibold">
                {t('analytics.whatCreated')}
              </h2>
              {data.totals.created === 0 ? (
                <p className="text-sm text-muted">{t('analytics.nothingCreated')}</p>
              ) : (
                <div className="space-y-3 text-sm">
                  <ul className="space-y-1">
                    {Object.entries(data.content.byKind).map(([k, n]) => (
                      <li key={k} className="flex justify-between">
                        <span>
                          {KIND_ICON[k]} {t(`kind.${k}` as MessageKey)}
                        </span>
                        <span className="tabular-nums">{n}</span>
                      </li>
                    ))}
                  </ul>
                  <ul className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                    {Object.entries(data.content.byLanguage).map(([l, n]) => (
                      <li key={l} className="chip-draft">
                        {LANG_LABELS[l] ?? l}: {n}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            <section className="card p-5">
              <h2 className="mb-3 font-display text-base font-semibold">
                {t('analytics.recentFailures')}
              </h2>
              {data.recentFailures.length === 0 ? (
                <p className="text-sm text-muted">{t('analytics.noFailed')}</p>
              ) : (
                <ul className="space-y-2.5">
                  {data.recentFailures.map((f) => (
                    <li key={f.jobId} className="text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <Link
                          href={`/studio/${f.contentId}`}
                          className="font-semibold hover:text-brand"
                        >
                          {f.channel}
                        </Link>
                        <span className="text-xs text-slate-400">
                          {new Date(f.at).toLocaleString(dateLocale)}
                        </span>
                      </div>
                      {f.error && <p className="text-xs text-danger-ink">{f.error}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
