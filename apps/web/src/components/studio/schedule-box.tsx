'use client';

import { useState } from 'react';
import { apiFetch, AutoQueueResult } from '@/lib/api';
import { nextHour, toLocalInput } from '@/lib/calendar';
import { describeError } from '@/lib/errors';
import { useI18n } from '@/lib/i18n';

/** Plans approved content for a date, or removes the plan. Used in the studio and on the calendar. */
export function ScheduleBox({
  base,
  scheduledFor,
  onChanged,
}: {
  /** `/organizations/:org/content/:id` */
  base: string;
  scheduledFor: string | null;
  onChanged: () => void | Promise<void>;
}) {
  const { t, dateLocale } = useI18n();
  const [value, setValue] = useState(() =>
    toLocalInput(scheduledFor ? new Date(scheduledFor) : nextHour()),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [auto, setAuto] = useState<AutoQueueResult | null>(null);

  async function run(path: 'schedule' | 'unschedule') {
    setBusy(true);
    setError('');
    setAuto(null);
    try {
      const res = await apiFetch<{ auto?: AutoQueueResult }>(`${base}/${path}`, {
        method: 'POST',
        body: JSON.stringify(
          path === 'schedule' ? { scheduledFor: new Date(value).toISOString() } : {},
        ),
      });
      if (path === 'schedule') setAuto(res.auto ?? null);
      await onChanged();
    } catch (e) {
      setError(describeError(e));
    }
    setBusy(false);
  }

  return (
    <div className="space-y-2">
      {scheduledFor && (
        <p className="text-xs text-slate-600">
          {t('schedule.planned')}{' '}
          <strong>{new Date(scheduledFor).toLocaleString(dateLocale)}</strong>
        </p>
      )}
      <input
        type="datetime-local"
        className="input"
        value={value}
        min={toLocalInput(new Date())}
        onChange={(e) => setValue(e.target.value)}
        disabled={busy}
        aria-label={t('schedule.dateTime')}
      />
      <div className="flex gap-2">
        <button
          className="btn-primary flex-1"
          onClick={() => run('schedule')}
          disabled={busy || !value}
        >
          {scheduledFor ? t('schedule.reschedule') : t('schedule.schedule')}
        </button>
        {scheduledFor && (
          <button className="btn-ghost" onClick={() => run('unschedule')} disabled={busy}>
            {t('common.remove')}
          </button>
        )}
      </div>
      {error && <p className="text-xs text-danger-ink">{error}</p>}
      {auto && auto.queued.length > 0 && (
        <p className="rounded-lg bg-ok-soft p-2 text-xs text-ok-ink">
          {t('schedule.autoPosted', { channels: auto.queued.join(', ') })}
        </p>
      )}
      {auto && auto.skipped.length > 0 && (
        <ul className="space-y-1 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
          {auto.skipped.map((s) => (
            <li key={s.channel}>
              {t('schedule.skipped', { channel: s.channel, reason: s.reason })}
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-slate-400">{t('schedule.hint')}</p>
    </div>
  );
}
