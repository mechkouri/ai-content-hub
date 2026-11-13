'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  AnalyticsOverview,
  apiFetch,
  CONTENT_KINDS,
  LANG_LABELS,
  PROVIDER_LABELS,
} from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { describeError } from '@/lib/errors';

const RANGES = [7, 30, 90] as const;
/** 45 min, 3.5 h, 2 days: whichever reads best. */
function duration(minutes: number): string {
  if (minutes < 60) return `${Math.max(1, minutes)} min`;
  const hours = minutes / 60;
  if (hours < 48) return `${Math.round(hours * 10) / 10} h`;
  return `${Math.round(hours / 24)} days`;
}

const KIND = Object.fromEntries(CONTENT_KINDS.map((k) => [k.id, k]));

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
  const max = Math.max(1, ...days.map((d) => d.published + d.failed));
  const total = days.reduce((n, d) => n + d.published + d.failed, 0);
  return (
    <div>
      <div
        className="flex h-40 items-end gap-px sm:gap-0.5"
        role="img"
        aria-label={`Posts per day over the last ${days.length} days: ${total} in total`}
      >
        {days.map((d) => (
          <div
            key={d.date}
            className="flex h-full min-w-0 flex-1 flex-col justify-end"
            title={`${d.date}: ${d.published} published, ${d.failed} failed`}
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
          <span className="h-2.5 w-2.5 rounded-sm bg-brand" /> Published
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-danger" /> Failed
        </span>
      </p>
    </div>
  );
}

export default function AnalyticsPage() {
  const { currentOrgId } = useApp();
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
          <h1 className="font-display text-2xl font-semibold">Analytics</h1>
          <p className="text-sm text-muted">What you made and published, from your own records.</p>
        </div>
        <div className="flex gap-2" role="group" aria-label="Period">
          {RANGES.map((r) => (
            <button
              key={r}
              className={days === r ? 'btn-primary' : 'btn-ghost'}
              onClick={() => setDays(r)}
              aria-pressed={days === r}
            >
              {r} days
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-danger-soft p-3 text-sm text-danger-ink">
          {error}
        </p>
      )}
      {!data && !error && <p className="text-sm text-muted">Loading…</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              label="Content created"
              value={String(data.totals.created)}
              hint={`last ${data.range.days} days`}
            />
            <Kpi
              label="Posts published"
              value={String(data.totals.published)}
              hint={data.totals.queued ? `${data.totals.queued} waiting` : undefined}
            />
            <Kpi
              label="Success rate"
              value={data.successRate === null ? '—' : `${data.successRate}%`}
              hint={data.totals.failed ? `${data.totals.failed} failed` : 'no failures'}
            />
            <Kpi
              label="Time to approve"
              value={data.approval.avgMinutes === null ? '—' : duration(data.approval.avgMinutes)}
              hint={
                data.approval.count ? `${data.approval.count} approved` : 'nothing approved yet'
              }
            />
          </div>

          <section className="card p-5">
            <h2 className="mb-3 font-display text-base font-semibold">Posts per day</h2>
            {data.totals.published + data.totals.failed === 0 ? (
              <p className="py-8 text-center text-sm text-muted">
                Nothing has been published in this period yet.
              </p>
            ) : (
              <DayChart days={data.byDay} />
            )}
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="card p-5">
              <h2 className="mb-3 font-display text-base font-semibold">By channel</h2>
              {data.byChannel.length === 0 ? (
                <p className="text-sm text-muted">No posts yet. Connect a channel and publish.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted">
                      <th className="pb-1.5 font-semibold">Channel</th>
                      <th className="pb-1.5 text-right font-semibold">Published</th>
                      <th className="pb-1.5 text-right font-semibold">Failed</th>
                      <th className="pb-1.5 text-right font-semibold">Waiting</th>
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
                            <p className="text-xs text-slate-400">
                              {PROVIDER_LABELS[c.provider].label}
                            </p>
                          )}
                        </td>
                        <td className="py-2 text-right tabular-nums">{c.published}</td>
                        <td className="py-2 text-right tabular-nums">{c.failed || '—'}</td>
                        <td className="py-2 text-right tabular-nums">{c.queued || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="card p-5">
              <h2 className="mb-1 font-display text-base font-semibold">Content pipeline</h2>
              <p className="mb-3 text-xs text-muted">All your content, right now.</p>
              {pipelineTotal === 0 ? (
                <p className="text-sm text-muted">No content yet.</p>
              ) : (
                <ul className="space-y-2.5">
                  {(
                    [
                      ['Draft', data.pipeline.draft, 'bg-slate-300'],
                      ['In review', data.pipeline.inReview, 'bg-brand'],
                      ['Changes requested', data.pipeline.changesRequested, 'bg-warn'],
                      ['Approved', data.pipeline.approved, 'bg-ok'],
                    ] as const
                  ).map(([label, n, color]) => (
                    <li key={label}>
                      <div className="flex justify-between text-sm">
                        <span>{label}</span>
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
              <h2 className="mb-3 font-display text-base font-semibold">What you created</h2>
              {data.totals.created === 0 ? (
                <p className="text-sm text-muted">Nothing created in this period.</p>
              ) : (
                <div className="space-y-3 text-sm">
                  <ul className="space-y-1">
                    {Object.entries(data.content.byKind).map(([k, n]) => (
                      <li key={k} className="flex justify-between">
                        <span>
                          {KIND[k]?.icon} {KIND[k]?.label ?? k}
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
              <h2 className="mb-3 font-display text-base font-semibold">Recent failures</h2>
              {data.recentFailures.length === 0 ? (
                <p className="text-sm text-muted">No failed posts in this period.</p>
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
                          {new Date(f.at).toLocaleString()}
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
