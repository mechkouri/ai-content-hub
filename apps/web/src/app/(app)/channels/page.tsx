'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ChannelForm, ChannelFormValues } from '@/components/channels/channel-form';
import { JobBadge, jobWhen } from '@/components/channels/job-parts';
import {
  apiFetch,
  canManageChannels,
  canScheduleContent,
  Channel,
  ChannelProvider,
  ContentSummary,
  PROVIDER_LABELS,
  ProviderInfo,
  PublishJob,
} from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { describeError } from '@/lib/errors';

export default function ChannelsPage() {
  const { currentOrgId, currentRole } = useApp();
  const canManage = canManageChannels(currentRole);
  const canPublish = canScheduleContent(currentRole);
  const base = `/organizations/${currentOrgId}`;

  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [jobs, setJobs] = useState<PublishJob[]>([]);
  const [titles, setTitles] = useState<Map<string, ContentSummary>>(new Map());
  const [adding, setAdding] = useState<ChannelProvider | null>(null);
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!currentOrgId) return;
    try {
      const [c, p, j, content] = await Promise.all([
        apiFetch<Channel[]>(`${base}/channels`),
        apiFetch<ProviderInfo[]>(`${base}/channels/providers`),
        apiFetch<PublishJob[]>(`${base}/publishing/jobs`),
        apiFetch<ContentSummary[]>(`${base}/content`),
      ]);
      setChannels(c);
      setProviders(p);
      setJobs(j);
      setTitles(new Map(content.map((x) => [x.id, x])));
    } catch (e) {
      setError(describeError(e));
    }
  }, [currentOrgId, base]);

  useEffect(() => {
    load();
  }, [load]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await fn();
      await load();
      return true;
    } catch (e) {
      setError(describeError(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const byChannel = new Map((channels ?? []).map((c) => [c.id, c]));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-semibold">Channels</h1>
        <p className="text-sm text-muted">
          Where your approved content is published: social pages and websites.
        </p>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-danger-soft p-3 text-sm text-danger-ink">
          {error}
        </p>
      )}

      <section className="card p-5">
        <h2 className="font-display text-base font-semibold">Connected channels</h2>
        {channels === null ? (
          <p className="mt-2 text-sm text-muted">Loading…</p>
        ) : channels.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            Nothing connected yet.{' '}
            {canManage
              ? 'Add the test channel below to try publishing safely.'
              : 'An admin can connect one.'}
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {channels.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="truncate font-semibold" dir="auto">
                    {c.name}
                  </p>
                  <p className="text-xs text-slate-400">
                    {PROVIDER_LABELS[c.provider].label}
                    {c.config?.siteUrl ? ` · ${c.config.siteUrl.replace(/^https:\/\//, '')}` : ''}
                    {c.config?.pageName ? ` · ${c.config.pageName}` : ''}
                    {c.config?.memberName ? ` · ${c.config.memberName}` : ''}
                    {c.config?.publishAs === 'draft' ? ' · saves drafts' : ''}
                  </p>
                  {c.status === 'ERROR' && (
                    <p className="mt-1 text-xs text-danger-ink">
                      {c.lastError ?? 'The login stopped working.'} Remove this channel and add it
                      again with a new application password.
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={
                      c.status === 'CONNECTED'
                        ? 'chip-ok'
                        : c.status === 'ERROR'
                          ? 'chip-warn'
                          : 'chip-draft'
                    }
                  >
                    {c.status === 'CONNECTED'
                      ? 'Connected'
                      : c.status === 'ERROR'
                        ? 'Needs reconnecting'
                        : 'Paused'}
                  </span>
                  {canManage && (
                    <>
                      {c.status !== 'ERROR' && (
                        <button
                          className="text-xs font-semibold text-brand"
                          disabled={busy}
                          onClick={() =>
                            run(() =>
                              apiFetch(`${base}/channels/${c.id}`, {
                                method: 'PATCH',
                                body: JSON.stringify({
                                  status: c.status === 'CONNECTED' ? 'DISCONNECTED' : 'CONNECTED',
                                }),
                              }),
                            )
                          }
                        >
                          {c.status === 'CONNECTED' ? 'Pause' : 'Resume'}
                        </button>
                      )}
                      <button
                        className="text-xs font-semibold text-slate-400 hover:text-danger"
                        disabled={busy}
                        onClick={() => {
                          if (
                            confirm(`Remove "${c.name}"? Its publishing history is removed too.`)
                          ) {
                            run(() => apiFetch(`${base}/channels/${c.id}`, { method: 'DELETE' }));
                          }
                        }}
                      >
                        Remove
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-5">
        <h2 className="font-display text-base font-semibold">Add a channel</h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {providers.map((p) => {
            const info = PROVIDER_LABELS[p.provider];
            return (
              <li
                key={p.provider}
                className={`rounded-xl border border-line p-3 ${adding === p.provider && p.provider !== 'TEST' ? 'sm:col-span-2 xl:col-span-2' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold">{info.label}</p>
                  {!p.available && <span className="chip-draft">Soon</span>}
                </div>
                <p className="mt-0.5 text-xs text-muted">{info.blurb}</p>
                {p.available && canManage && adding !== p.provider && (
                  <button
                    className="btn-ghost mt-2"
                    onClick={() => {
                      setAdding(p.provider);
                      setFormError('');
                    }}
                  >
                    Add
                  </button>
                )}
                {adding === p.provider && (
                  <ChannelForm
                    provider={p.provider}
                    busy={busy}
                    error={formError}
                    onCancel={() => {
                      setAdding(null);
                      setFormError('');
                    }}
                    onSubmit={async (v: ChannelFormValues) => {
                      setBusy(true);
                      setFormError('');
                      try {
                        await apiFetch(`${base}/channels`, {
                          method: 'POST',
                          body: JSON.stringify({ provider: p.provider, ...v }),
                        });
                        setAdding(null);
                        await load();
                      } catch (e) {
                        setFormError(describeError(e));
                      }
                      setBusy(false);
                    }}
                  />
                )}
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-[11px] text-slate-400">
          Real social networks and websites are being added one by one. The test channel never posts
          anything.
        </p>
      </section>

      <section className="card p-5">
        <h2 className="font-display text-base font-semibold">Publishing activity</h2>
        {jobs.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            Nothing has been published yet. Approve content in the studio, then publish it.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {jobs.map((j) => {
              const piece = titles.get(j.contentId);
              const ch = byChannel.get(j.channelId);
              return (
                <li key={j.id} className="space-y-1 py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link
                      href={`/studio/${j.contentId}`}
                      className="min-w-0 truncate text-sm font-semibold hover:text-brand"
                      dir="auto"
                    >
                      {piece?.title ?? j.payload?.title ?? 'Content'}
                    </Link>
                    <JobBadge status={j.status} />
                  </div>
                  <p className="text-xs text-slate-400">
                    {ch?.name ?? 'Removed channel'} · {jobWhen(j)}
                  </p>
                  {j.lastError && j.status !== 'PUBLISHED' && (
                    <p className="text-xs text-danger-ink">{j.lastError}</p>
                  )}
                  {j.payload?.text && (
                    <details className="text-xs text-slate-500">
                      <summary className="cursor-pointer">
                        {j.status === 'PUBLISHED' ? 'What was posted' : 'What will be posted'}
                      </summary>
                      <p className="mt-1 whitespace-pre-wrap rounded-lg bg-surface p-2" dir="auto">
                        {j.payload.text}
                      </p>
                    </details>
                  )}
                  {canPublish && (
                    <div className="flex gap-3 text-xs">
                      {j.status === 'QUEUED' && (
                        <button
                          className="font-semibold text-slate-500 hover:text-danger"
                          disabled={busy}
                          onClick={() =>
                            run(() =>
                              apiFetch(`${base}/publishing/jobs/${j.id}/cancel`, {
                                method: 'POST',
                              }),
                            )
                          }
                        >
                          Cancel
                        </button>
                      )}
                      {(j.status === 'FAILED' || j.status === 'CANCELLED') && (
                        <button
                          className="font-semibold text-brand"
                          disabled={busy}
                          onClick={() =>
                            run(() =>
                              apiFetch(`${base}/publishing/jobs/${j.id}/retry`, { method: 'POST' }),
                            )
                          }
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
      </section>
    </div>
  );
}
