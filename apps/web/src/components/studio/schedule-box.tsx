'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { nextHour, toLocalInput } from '@/lib/calendar';
import { describeError } from '@/lib/errors';

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
  const [value, setValue] = useState(() =>
    toLocalInput(scheduledFor ? new Date(scheduledFor) : nextHour()),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run(path: 'schedule' | 'unschedule') {
    setBusy(true);
    setError('');
    try {
      await apiFetch(`${base}/${path}`, {
        method: 'POST',
        body: JSON.stringify(
          path === 'schedule' ? { scheduledFor: new Date(value).toISOString() } : {},
        ),
      });
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
          Planned for <strong>{new Date(scheduledFor).toLocaleString()}</strong>
        </p>
      )}
      <input
        type="datetime-local"
        className="input"
        value={value}
        min={toLocalInput(new Date())}
        onChange={(e) => setValue(e.target.value)}
        disabled={busy}
        aria-label="Date and time"
      />
      <div className="flex gap-2">
        <button
          className="btn-primary flex-1"
          onClick={() => run('schedule')}
          disabled={busy || !value}
        >
          {scheduledFor ? 'Reschedule' : 'Schedule'}
        </button>
        {scheduledFor && (
          <button className="btn-ghost" onClick={() => run('unschedule')} disabled={busy}>
            Remove
          </button>
        )}
      </div>
      {error && <p className="text-xs text-danger-ink">{error}</p>}
      <p className="text-[11px] text-slate-400">
        This plans the date. To post at that time, choose “At the scheduled time” in the Publish
        section.
      </p>
    </div>
  );
}
