'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  CampaignForm,
  CampaignValues,
  dateRange,
  Progress,
} from '@/components/campaigns/campaign-parts';
import { ApprovalBadge } from '@/components/studio/approval';
import {
  apiFetch,
  canWriteCampaigns,
  CampaignDetail,
  CONTENT_KINDS,
  ContentSummary,
  LANG_LABELS,
} from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { describeError } from '@/lib/errors';

const KIND = Object.fromEntries(CONTENT_KINDS.map((k) => [k.id, k]));

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { currentOrgId, currentRole } = useApp();
  const canWrite = canWriteCampaigns(currentRole);
  const base = `/organizations/${currentOrgId}/campaigns/${id}`;

  const [data, setData] = useState<CampaignDetail | null>(null);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [candidates, setCandidates] = useState<ContentSummary[]>([]);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!currentOrgId) return;
    try {
      setData(await apiFetch<CampaignDetail>(base));
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

  async function openAdd() {
    setAdding(true);
    setChosen(new Set());
    try {
      const all = await apiFetch<ContentSummary[]>(`/organizations/${currentOrgId}/content`);
      setCandidates(all.filter((p) => p.campaignId !== id));
    } catch (e) {
      setError(describeError(e));
    }
  }

  if (!data) return <p className="text-sm text-muted">{error || 'Loading…'}</p>;
  const { campaign, pieces, stats } = data;
  const archived = campaign.status === 'ARCHIVED';

  return (
    <div className="space-y-4">
      <Link href="/campaigns" className="text-sm font-semibold text-brand">
        ← Campaigns
      </Link>

      <section className="card p-6">
        {editing ? (
          <CampaignForm
            initial={campaign}
            submitLabel="Save changes"
            busy={busy}
            error={error}
            onCancel={() => setEditing(false)}
            onSubmit={async (v: CampaignValues) => {
              const ok = await run(() =>
                apiFetch(base, { method: 'PATCH', body: JSON.stringify(v) }),
              );
              if (ok) setEditing(false);
            }}
          />
        ) : (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1
                className="flex flex-wrap items-center gap-2 font-display text-2xl font-semibold"
                dir="auto"
              >
                {campaign.name}
                {archived && <span className="chip-draft">Archived</span>}
              </h1>
              <p className="mt-1 text-sm text-muted">{dateRange(campaign)}</p>
              {campaign.description && (
                <p className="mt-2 max-w-2xl text-sm text-slate-600" dir="auto">
                  {campaign.description}
                </p>
              )}
            </div>
            {canWrite && (
              <div className="flex flex-wrap gap-2">
                <button className="btn-ghost" onClick={() => setEditing(true)}>
                  Edit
                </button>
                <button
                  className="btn-ghost"
                  disabled={busy}
                  onClick={() =>
                    run(() =>
                      apiFetch(base, {
                        method: 'PATCH',
                        body: JSON.stringify({ status: archived ? 'ACTIVE' : 'ARCHIVED' }),
                      }),
                    )
                  }
                >
                  {archived ? 'Restore' : 'Archive'}
                </button>
                <button
                  className="btn-danger"
                  disabled={busy}
                  onClick={async () => {
                    if (
                      !confirm('Delete this campaign? Its content is kept, but no longer grouped.')
                    )
                      return;
                    if (await run(() => apiFetch(base, { method: 'DELETE' }))) {
                      router.replace('/campaigns');
                    }
                  }}
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        )}
        {!editing && error && (
          <p className="mt-3 rounded-lg border border-red-200 bg-danger-soft p-3 text-sm text-danger-ink">
            {error}
          </p>
        )}
        <div className="mt-5">
          <Progress stats={stats} />
        </div>
      </section>

      <section className="card p-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-base font-semibold">Content in this campaign</h2>
          {canWrite && !archived && !adding && (
            <button className="btn-primary" onClick={openAdd}>
              Add content
            </button>
          )}
        </div>

        {adding && (
          <div className="mb-4 rounded-xl border border-line bg-surface p-4">
            {candidates.length === 0 ? (
              <p className="text-sm text-muted">
                Nothing left to add. Create content in the studio first.
              </p>
            ) : (
              <ul className="max-h-72 space-y-1 overflow-y-auto">
                {candidates.map((p) => (
                  <li key={p.id}>
                    <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-white">
                      <input
                        type="checkbox"
                        checked={chosen.has(p.id)}
                        onChange={(e) => {
                          const next = new Set(chosen);
                          if (e.target.checked) next.add(p.id);
                          else next.delete(p.id);
                          setChosen(next);
                        }}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm" dir="auto">
                        {KIND[p.kind].icon} {p.title}
                      </span>
                      {p.campaignId && (
                        <span className="text-[11px] text-slate-400">in another campaign</span>
                      )}
                      <ApprovalBadge status={p.approvalStatus} />
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex gap-2">
              <button
                className="btn-primary"
                disabled={busy || chosen.size === 0}
                onClick={async () => {
                  const ok = await run(() =>
                    apiFetch(`${base}/content`, {
                      method: 'POST',
                      body: JSON.stringify({ contentIds: [...chosen].slice(0, 50) }),
                    }),
                  );
                  if (ok) setAdding(false);
                }}
              >
                Add {chosen.size || ''} selected
              </button>
              <button className="btn-ghost" onClick={() => setAdding(false)} disabled={busy}>
                Cancel
              </button>
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              Content belongs to one campaign at a time: adding it here moves it.
            </p>
          </div>
        )}

        {pieces.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted">
            <p className="text-3xl">🗂️</p>
            <p className="mt-2 font-semibold text-slate-700">No content yet</p>
            <p>{canWrite && !archived ? 'Use “Add content” to start.' : ''}</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {pieces.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <Link href={`/studio/${p.id}`} className="min-w-0 flex-1 hover:text-brand">
                  <p className="truncate font-semibold" dir="auto">
                    {p.title}
                  </p>
                  <p className="text-xs text-slate-400">
                    {KIND[p.kind].icon} {KIND[p.kind].label} ·{' '}
                    {LANG_LABELS[p.language] ?? p.language}
                    {p.scheduledFor
                      ? ` · planned ${new Date(p.scheduledFor).toLocaleDateString()}`
                      : ''}
                  </p>
                </Link>
                <div className="flex items-center gap-3">
                  <ApprovalBadge status={p.approvalStatus} />
                  {canWrite && (
                    <button
                      className="text-xs font-semibold text-slate-400 hover:text-danger"
                      disabled={busy}
                      onClick={() =>
                        run(() => apiFetch(`${base}/content/${p.id}`, { method: 'DELETE' }))
                      }
                      aria-label={`Remove ${p.title} from the campaign`}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
