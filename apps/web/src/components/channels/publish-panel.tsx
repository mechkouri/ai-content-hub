'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, apiFetch, Channel, PROVIDER_LABELS, PublishJob, PublishQueued } from '@/lib/api';
import { describeError } from '@/lib/errors';
import { useI18n } from '@/lib/i18n';
import { JobBadge, jobWhen } from './job-parts';

/** Publishes approved content to connected channels, and shows what happened to each post. */
export function PublishPanel({
  orgId,
  contentId,
  scheduledFor,
  canPublish,
}: {
  orgId: string;
  contentId: string;
  scheduledFor: string | null;
  canPublish: boolean;
}) {
  const base = `/organizations/${orgId}`;
  const { t, dateLocale } = useI18n();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [jobs, setJobs] = useState<PublishJob[]>([]);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [when, setWhen] = useState<'now' | 'scheduled'>('now');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const [advice, setAdvice] = useState<string[]>([]);

  const load = useCallback(async () => {
    try {
      const [c, j] = await Promise.all([
        apiFetch<Channel[]>(`${base}/channels`),
        apiFetch<PublishJob[]>(`${base}/publishing/jobs?contentId=${contentId}`),
      ]);
      setChannels(c);
      setJobs(j);
    } catch (e) {
      setError(describeError(e));
    }
  }, [base, contentId]);

  // Scheduling can queue posts automatically, so look again whenever the date changes.
  useEffect(() => {
    load();
  }, [load, scheduledFor]);

  // A schedule can be removed while this panel is open: fall back to "now".
  useEffect(() => {
    if (!scheduledFor && when === 'scheduled') setWhen('now');
  }, [scheduledFor, when]);

  // Keep the status fresh while something is waiting or going out.
  const active = jobs.some((j) => j.status === 'QUEUED' || j.status === 'PUBLISHING');
  useEffect(() => {
    if (!active) return;
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [active, load]);

  const byChannel = new Map(channels.map((c) => [c.id, c]));
  const connected = channels.filter((c) => c.status === 'CONNECTED');
  // Channels that already have a live or finished post cannot be chosen again.
  const taken = new Set(
    jobs.filter((j) => j.status !== 'FAILED' && j.status !== 'CANCELLED').map((j) => j.channelId),
  );

  async function publish() {
    setBusy(true);
    setError('');
    setProblems([]);
    setAdvice([]);
    try {
      const res = await apiFetch<PublishQueued>(`${base}/publishing/jobs`, {
        method: 'POST',
        body: JSON.stringify({ contentId, channelIds: [...chosen], when }),
      });
      setAdvice(res.warnings);
      setChosen(new Set());
      await load();
    } catch (e) {
      setError(describeError(e));
      const body =
        e instanceof ApiError ? (e.body as { errors?: string[]; warnings?: string[] }) : null;
      if (body?.errors) setProblems(body.errors);
      if (body?.warnings) setAdvice(body.warnings);
    }
    setBusy(false);
  }

  async function act(jobId: string, action: 'cancel' | 'retry') {
    setBusy(true);
    setError('');
    try {
      await apiFetch(`${base}/publishing/jobs/${jobId}/${action}`, { method: 'POST' });
      await load();
    } catch (e) {
      setError(describeError(e));
    }
    setBusy(false);
  }

  return (
    <div className="space-y-3">
      {jobs.length > 0 && (
        <ul className="space-y-2">
          {jobs.map((j) => {
            const ch = byChannel.get(j.channelId);
            return (
              <li key={j.id} className="rounded-lg border border-line p-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate font-semibold text-slate-700">
                    {ch ? ch.name : 'Removed channel'}
                  </span>
                  <JobBadge status={j.status} />
                </div>
                <p className="mt-0.5 text-slate-500">{jobWhen(j, t, dateLocale)}</p>
                {j.lastError && j.status !== 'PUBLISHED' && (
                  <p className="mt-1 text-danger-ink">{j.lastError}</p>
                )}
                {j.externalUrl && (
                  <a
                    href={j.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-block font-semibold text-brand"
                  >
                    View post
                  </a>
                )}
                {canPublish && (
                  <div className="mt-1.5 flex gap-3">
                    {j.status === 'QUEUED' && (
                      <button
                        className="font-semibold text-slate-500 hover:text-danger"
                        onClick={() => act(j.id, 'cancel')}
                        disabled={busy}
                      >
                        Cancel
                      </button>
                    )}
                    {(j.status === 'FAILED' || j.status === 'CANCELLED') && (
                      <button
                        className="font-semibold text-brand"
                        onClick={() => act(j.id, 'retry')}
                        disabled={busy}
                      >
                        Try again
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canPublish ? (
        connected.length === 0 ? (
          <p className="text-xs text-muted">
            No channel is connected yet. An admin can add one on the Channels page.
          </p>
        ) : (
          <div className="space-y-2">
            <fieldset className="space-y-1">
              <legend className="text-xs font-semibold text-slate-600">Publish to</legend>
              {connected.map((c) => (
                <label
                  key={c.id}
                  className={`flex items-center gap-2 text-sm ${taken.has(c.id) ? 'opacity-50' : ''}`}
                >
                  <input
                    type="checkbox"
                    disabled={taken.has(c.id) || busy}
                    checked={chosen.has(c.id)}
                    onChange={(e) => {
                      const next = new Set(chosen);
                      if (e.target.checked) next.add(c.id);
                      else next.delete(c.id);
                      setChosen(next);
                    }}
                  />
                  <span className="truncate">{c.name}</span>
                  <span className="text-[11px] text-slate-400">
                    {PROVIDER_LABELS[c.provider].label}
                  </span>
                </label>
              ))}
            </fieldset>
            <fieldset className="space-y-1 text-sm">
              <legend className="text-xs font-semibold text-slate-600">When</legend>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="when"
                  checked={when === 'now'}
                  onChange={() => setWhen('now')}
                />
                Now
              </label>
              <label className={`flex items-center gap-2 ${scheduledFor ? '' : 'opacity-50'}`}>
                <input
                  type="radio"
                  name="when"
                  disabled={!scheduledFor}
                  checked={when === 'scheduled'}
                  onChange={() => setWhen('scheduled')}
                />
                {scheduledFor
                  ? `At the scheduled time (${new Date(scheduledFor).toLocaleString()})`
                  : 'At the scheduled time (schedule it first)'}
              </label>
            </fieldset>
            <button
              className="btn-primary w-full"
              onClick={publish}
              disabled={busy || chosen.size === 0}
            >
              {when === 'now' ? 'Publish now' : 'Queue for the scheduled time'}
            </button>
          </div>
        )
      ) : (
        <p className="text-xs text-muted">Publishers and admins can publish this content.</p>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-danger-soft p-2.5 text-xs text-danger-ink">
          <p className="font-semibold">{error}</p>
          {problems.length > 0 && (
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {advice.length > 0 && (
        <div className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900">
          <p className="font-semibold">Tips to get more from this post</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {advice.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-[11px] text-slate-400">
        Editing the content cancels any post that is still waiting.
      </p>
    </div>
  );
}
