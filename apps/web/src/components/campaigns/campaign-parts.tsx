'use client';

import { FormEvent, useState } from 'react';
import { Campaign, CampaignStats } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/lib/i18n/messages';

/** A campaign date is a plain day stored at midnight UTC, so read it in UTC to never shift it. */
export const dayOf = (iso: string | null) => (iso ? iso.slice(0, 10) : '');
export const showDay = (iso: string | null, dateLocale = 'en') =>
  iso
    ? new Date(iso).toLocaleDateString(dateLocale, {
        timeZone: 'UTC',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '';

export function dateRange(
  c: Pick<Campaign, 'startsOn' | 'endsOn'>,
  t: (key: MessageKey, params?: Record<string, string | number>) => string,
  dateLocale: string,
) {
  const start = showDay(c.startsOn, dateLocale);
  const end = showDay(c.endsOn, dateLocale);
  if (c.startsOn && c.endsOn) return `${start} – ${end}`;
  if (c.startsOn) return t('camp.from', { date: start });
  if (c.endsOn) return t('camp.until', { date: end });
  return t('camp.noDates');
}

/** Share of the campaign's content that is approved (scheduled content is approved too). */
export function Progress({ stats }: { stats: CampaignStats }) {
  const { t } = useI18n();
  const pct = stats.total ? Math.round((stats.approved / stats.total) * 100) : 0;
  return (
    <div>
      <div
        className="h-2 overflow-hidden rounded-full bg-surface-sub"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t('camp.approvedLabel')}
      >
        <div className="h-full rounded-full bg-ok" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-muted">
        {stats.total === 0
          ? t('camp.noContentYet')
          : t('camp.progress', {
              approved: stats.approved,
              total: stats.total,
              inReview: stats.inReview,
              draft: stats.draft,
              scheduled: stats.scheduled,
            })}
      </p>
    </div>
  );
}

export interface CampaignValues {
  name: string;
  description: string | null;
  startsOn: string | null;
  endsOn: string | null;
}

/** Create or edit form. Dates are plain "YYYY-MM-DD" strings, exactly what the API expects. */
export function CampaignForm({
  initial,
  submitLabel,
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  initial?: Campaign;
  submitLabel: string;
  busy: boolean;
  error: string;
  onSubmit: (v: CampaignValues) => void;
  onCancel?: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [startsOn, setStartsOn] = useState(dayOf(initial?.startsOn ?? null));
  const [endsOn, setEndsOn] = useState(dayOf(initial?.endsOn ?? null));
  const badRange = !!startsOn && !!endsOn && endsOn < startsOn;

  function submit(e: FormEvent) {
    e.preventDefault();
    onSubmit({
      name: name.trim(),
      description: description.trim() || null,
      startsOn: startsOn || null,
      endsOn: endsOn || null,
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <input
        className="input"
        placeholder={t('camp.namePlaceholder')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={120}
        required
        minLength={2}
        aria-label={t('camp.nameLabel')}
      />
      <textarea
        className="input min-h-[72px]"
        placeholder={t('camp.descPlaceholder')}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        maxLength={2000}
        aria-label={t('camp.descLabel')}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-slate-600">
          {t('camp.starts')}
          <input
            type="date"
            className="input mt-1"
            value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)}
          />
        </label>
        <label className="text-xs font-semibold text-slate-600">
          {t('camp.ends')}
          <input
            type="date"
            className="input mt-1"
            value={endsOn}
            min={startsOn || undefined}
            onChange={(e) => setEndsOn(e.target.value)}
          />
        </label>
      </div>
      {badRange && <p className="text-xs text-danger-ink">{t('camp.badRange')}</p>}
      {error && <p className="text-sm text-danger-ink">{error}</p>}
      <div className="flex gap-2">
        <button className="btn-primary" disabled={busy || badRange || name.trim().length < 2}>
          {busy ? t('camp.saving') : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn-ghost" onClick={onCancel} disabled={busy}>
            {t('common.cancel')}
          </button>
        )}
      </div>
    </form>
  );
}
