'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScheduleBox } from '@/components/studio/schedule-box';
import { apiFetch, canScheduleContent, CONTENT_KINDS, ContentSummary } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { addMonths, dayKey, monthGrid, startOfMonth } from '@/lib/calendar';
import { describeError } from '@/lib/errors';
import { useI18n } from '@/lib/i18n';

const KIND = Object.fromEntries(CONTENT_KINDS.map((k) => [k.id, k]));
function Item({ p }: { p: ContentSummary }) {
  const { dateLocale } = useI18n();
  const time = new Date(p.scheduledFor!).toLocaleTimeString(dateLocale, {
    hour: '2-digit',
    minute: '2-digit',
  });
  return (
    <Link
      href={`/studio/${p.id}`}
      className="flex items-center gap-1.5 rounded-md bg-brand-soft px-1.5 py-1 text-[11px] font-medium text-brand-dark hover:bg-brand-line"
      title={p.title}
    >
      <span aria-hidden>{KIND[p.kind].icon}</span>
      <span className="shrink-0 tabular-nums">{time}</span>
      <span className="truncate" dir="auto">
        {p.title}
      </span>
    </Link>
  );
}

export default function CalendarPage() {
  const { currentOrgId, currentRole } = useApp();
  const { t, dateLocale } = useI18n();
  const canSchedule = canScheduleContent(currentRole);
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [scheduled, setScheduled] = useState<ContentSummary[] | null>(null);
  const [unscheduled, setUnscheduled] = useState<ContentSummary[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState('');

  const days = useMemo(() => monthGrid(month), [month]);

  const load = useCallback(async () => {
    if (!currentOrgId) return;
    const base = `/organizations/${currentOrgId}/content`;
    const from = days[0];
    const to = new Date(days[days.length - 1].getTime() + 24 * 60 * 60 * 1000);
    try {
      const [inRange, approved] = await Promise.all([
        apiFetch<ContentSummary[]>(
          `${base}?scheduledFrom=${encodeURIComponent(from.toISOString())}&scheduledTo=${encodeURIComponent(to.toISOString())}`,
        ),
        apiFetch<ContentSummary[]>(`${base}?approvalStatus=APPROVED`),
      ]);
      setScheduled(inRange);
      setUnscheduled(approved.filter((p) => !p.scheduledFor));
      setError('');
    } catch (e) {
      setError(describeError(e));
    }
  }, [currentOrgId, days]);

  useEffect(() => {
    setScheduled(null);
    load();
  }, [load]);

  const byDay = useMemo(() => {
    const map = new Map<string, ContentSummary[]>();
    for (const p of scheduled ?? []) {
      const k = dayKey(new Date(p.scheduledFor!));
      map.set(k, [...(map.get(k) ?? []), p]);
    }
    return map;
  }, [scheduled]);

  const todayKey = dayKey(new Date());
  const title = month.toLocaleDateString(dateLocale, { month: 'long', year: 'numeric' });
  // Monday-first weekday names in the current language (2026-11-02 is a Monday).
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Date(2026, 10, 2 + i).toLocaleDateString(dateLocale, { weekday: 'short' }),
  );
  const agenda = days.filter((d) => d.getMonth() === month.getMonth() && byDay.has(dayKey(d)));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">{t('nav.calendar')}</h1>
          <p className="text-sm text-muted">{t('cal.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn-ghost !px-2.5"
            onClick={() => setMonth(addMonths(month, -1))}
            aria-label={t('cal.prev')}
          >
            <ChevronLeft size={16} aria-hidden className="rtl:rotate-180" />
          </button>
          <span className="min-w-[9rem] text-center font-display text-base font-semibold">
            {title}
          </span>
          <button
            className="btn-ghost !px-2.5"
            onClick={() => setMonth(addMonths(month, 1))}
            aria-label={t('cal.next')}
          >
            <ChevronRight size={16} aria-hidden className="rtl:rotate-180" />
          </button>
          <button className="btn-ghost" onClick={() => setMonth(startOfMonth(new Date()))}>
            {t('cal.today')}
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-danger-soft p-3 text-sm text-danger-ink">
          {error}
        </p>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <section className="card overflow-hidden">
          <div className="hidden md:block">
            <div className="grid grid-cols-7 border-b border-line bg-surface-sub text-center">
              {weekdays.map((w) => (
                <div
                  key={w}
                  className="py-2 font-label text-[11px] font-semibold uppercase text-muted"
                >
                  {w}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((d) => {
                const items = byDay.get(dayKey(d)) ?? [];
                const outside = d.getMonth() !== month.getMonth();
                return (
                  <div
                    key={d.toISOString()}
                    className={`min-h-[104px] space-y-1 border-b border-e border-line p-1.5 ${outside ? 'bg-surface-sub/60' : ''}`}
                  >
                    <span
                      className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs ${
                        dayKey(d) === todayKey
                          ? 'bg-brand font-bold text-white'
                          : outside
                            ? 'text-slate-300'
                            : 'text-slate-600'
                      }`}
                    >
                      {d.getDate()}
                    </span>
                    {items.map((p) => (
                      <Item key={p.id} p={p} />
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Narrow screens: a plain list of the days that have something planned. */}
          <div className="divide-y divide-line md:hidden">
            {scheduled === null ? (
              <p className="p-4 text-sm text-muted">{t('common.loading')}</p>
            ) : agenda.length === 0 ? (
              <p className="p-4 text-sm text-muted">{t('cal.nothingIn', { month: title })}</p>
            ) : (
              agenda.map((d) => (
                <div key={d.toISOString()} className="space-y-1 p-3">
                  <p className="text-xs font-semibold text-slate-500">
                    {d.toLocaleDateString(dateLocale, {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                    })}
                  </p>
                  {byDay.get(dayKey(d))!.map((p) => (
                    <Item key={p.id} p={p} />
                  ))}
                </div>
              ))
            )}
          </div>
        </section>

        <aside className="card h-fit p-4">
          <h2 className="font-display text-base font-semibold">{t('cal.unscheduled')}</h2>
          {unscheduled.length === 0 ? (
            <p className="mt-2 text-sm text-muted">{t('cal.nothingWaiting')}</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {unscheduled.map((p) => (
                <li key={p.id} className="rounded-lg border border-line p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/studio/${p.id}`}
                      className="min-w-0 text-sm font-semibold hover:text-brand"
                      dir="auto"
                    >
                      <span aria-hidden>{KIND[p.kind].icon}</span> {p.title}
                    </Link>
                    {canSchedule && (
                      <button
                        className="shrink-0 text-xs font-semibold text-brand"
                        onClick={() => setPicked(picked === p.id ? null : p.id)}
                      >
                        {picked === p.id ? t('common.close') : t('schedule.schedule')}
                      </button>
                    )}
                  </div>
                  {canSchedule && picked === p.id && (
                    <div className="mt-2">
                      <ScheduleBox
                        base={`/organizations/${currentOrgId}/content/${p.id}`}
                        scheduledFor={null}
                        onChanged={async () => {
                          setPicked(null);
                          await load();
                        }}
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {!canSchedule && unscheduled.length > 0 && (
            <p className="mt-3 text-[11px] text-slate-400">{t('cal.publishersOnly')}</p>
          )}
        </aside>
      </div>
    </div>
  );
}
