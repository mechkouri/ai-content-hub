'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  ChannelForm,
  ChannelFormValues,
  ReconnectForm,
  ReconnectValues,
} from '@/components/channels/channel-form';
import { JobBadge, jobWhen } from '@/components/channels/job-parts';
import {
  apiFetch,
  canManageChannels,
  canScheduleContent,
  Channel,
  ChannelProvider,
  ContentSummary,
  ProviderInfo,
  PublishJob,
} from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { describeError } from '@/lib/errors';
import { useI18n } from '@/lib/i18n';

export default function ChannelsPage() {
  const { currentOrgId, currentRole } = useApp();
  const canManage = canManageChannels(currentRole);
  const canPublish = canScheduleContent(currentRole);
  const { t, dateLocale } = useI18n();
  const base = `/organizations/${currentOrgId}`;

  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [jobs, setJobs] = useState<PublishJob[]>([]);
  const [titles, setTitles] = useState<Map<string, ContentSummary>>(new Map());
  const [adding, setAdding] = useState<ChannelProvider | null>(null);
  const [formError, setFormError] = useState('');
  const [reconnecting, setReconnecting] = useState<string | null>(null);
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
        <h1 className="font-display text-2xl font-semibold">{t('nav.channels')}</h1>
        <p className="text-sm text-muted">{t('ch.subtitle')}</p>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-danger-soft p-3 text-sm text-danger-ink">
          {error}
        </p>
      )}

      <section className="card p-5">
        <h2 className="font-display text-base font-semibold">{t('ch.connected')}</h2>
        {channels === null ? (
          <p className="mt-2 text-sm text-muted">{t('common.loading')}</p>
        ) : channels.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            {t('ch.nothing')} {canManage ? t('ch.addTest') : t('ch.askAdmin')}
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
                    {t(`provider.${c.provider}`)}
                    {c.config?.siteUrl ? ` · ${c.config.siteUrl.replace(/^https:\/\//, '')}` : ''}
                    {c.config?.pageName ? ` · ${c.config.pageName}` : ''}
                    {c.config?.memberName ? ` · ${c.config.memberName}` : ''}
                    {c.config?.publishAs === 'draft' ? ` · ${t('ch.savesDrafts')}` : ''}
                  </p>
                  {c.status === 'ERROR' && (
                    <p className="mt-1 text-xs text-danger-ink">
                      {c.lastError ?? t('ch.loginStopped')} {t('ch.reconnectHint')}
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
                    {t(`ch.status.${c.status}`)}
                  </span>
                  {canManage && c.status !== 'ERROR' && (
                    <label className="flex items-center gap-1.5 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={c.autoPublish}
                        disabled={busy}
                        onChange={(e) =>
                          run(() =>
                            apiFetch(`${base}/channels/${c.id}`, {
                              method: 'PATCH',
                              body: JSON.stringify({ autoPublish: e.target.checked }),
                            }),
                          )
                        }
                      />
                      {t('ch.autoPost')}
                    </label>
                  )}
                  {!canManage && c.autoPublish && (
                    <span className="text-xs text-slate-500">{t('ch.autoPosts')}</span>
                  )}
                  {canManage && (
                    <>
                      {c.status === 'ERROR' && c.provider !== 'TEST' && (
                        <button
                          className="text-xs font-semibold text-brand"
                          disabled={busy}
                          onClick={() => {
                            setReconnecting(reconnecting === c.id ? null : c.id);
                            setFormError('');
                          }}
                        >
                          {t('ch.reconnect')}
                        </button>
                      )}
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
                          {c.status === 'CONNECTED' ? t('ch.pause') : t('ch.resume')}
                        </button>
                      )}
                      <button
                        className="text-xs font-semibold text-slate-400 hover:text-danger"
                        disabled={busy}
                        onClick={() => {
                          if (confirm(t('ch.confirmRemove', { name: c.name }))) {
                            run(() => apiFetch(`${base}/channels/${c.id}`, { method: 'DELETE' }));
                          }
                        }}
                      >
                        {t('common.remove')}
                      </button>
                    </>
                  )}
                </div>
                {reconnecting === c.id && (
                  <ReconnectForm
                    provider={c.provider}
                    busy={busy}
                    error={formError}
                    onCancel={() => {
                      setReconnecting(null);
                      setFormError('');
                    }}
                    onSubmit={async (v: ReconnectValues) => {
                      setBusy(true);
                      setFormError('');
                      try {
                        await apiFetch(`${base}/channels/${c.id}/reconnect`, {
                          method: 'POST',
                          body: JSON.stringify(v),
                        });
                        setReconnecting(null);
                        await load();
                      } catch (e) {
                        setFormError(describeError(e));
                      }
                      setBusy(false);
                    }}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-5">
        <h2 className="font-display text-base font-semibold">{t('ch.addTitle')}</h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {providers.map((p) => {
            return (
              <li
                key={p.provider}
                className={`rounded-xl border border-line p-3 ${adding === p.provider && p.provider !== 'TEST' ? 'sm:col-span-2 xl:col-span-2' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold">{t(`provider.${p.provider}`)}</p>
                  {!p.available && <span className="chip-draft">{t('nav.soon')}</span>}
                </div>
                <p className="mt-0.5 text-xs text-muted">{t(`provider.${p.provider}.blurb`)}</p>
                {p.available && canManage && adding !== p.provider && (
                  <button
                    className="btn-ghost mt-2"
                    onClick={() => {
                      setAdding(p.provider);
                      setFormError('');
                    }}
                  >
                    {t('ch.add')}
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
        <p className="mt-3 text-[11px] text-slate-400">{t('ch.note')}</p>
      </section>

      <section className="card p-5">
        <h2 className="font-display text-base font-semibold">{t('ch.activity')}</h2>
        {jobs.length === 0 ? (
          <p className="mt-2 text-sm text-muted">{t('ch.noActivity')}</p>
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
                      {piece?.title ?? j.payload?.title ?? t('ch.contentFallback')}
                    </Link>
                    <JobBadge status={j.status} />
                  </div>
                  <p className="text-xs text-slate-400">
                    {ch?.name ?? t('ch.removedChannel')} · {jobWhen(j, t, dateLocale)}
                  </p>
                  {j.lastError && j.status !== 'PUBLISHED' && (
                    <p className="text-xs text-danger-ink">{j.lastError}</p>
                  )}
                  {j.payload?.text && (
                    <details className="text-xs text-slate-500">
                      <summary className="cursor-pointer">
                        {j.status === 'PUBLISHED' ? t('ch.whatPosted') : t('ch.whatWillPost')}
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
                          {t('common.cancel')}
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
                          {t('ch.tryAgain')}
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
