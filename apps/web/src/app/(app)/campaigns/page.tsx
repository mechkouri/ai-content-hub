'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  CampaignForm,
  CampaignValues,
  dateRange,
  Progress,
} from '@/components/campaigns/campaign-parts';
import { apiFetch, canWriteCampaigns, Campaign, CampaignSummary } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { describeError } from '@/lib/errors';

export default function CampaignsPage() {
  const router = useRouter();
  const { currentOrgId, currentRole } = useApp();
  const canWrite = canWriteCampaigns(currentRole);
  const base = `/organizations/${currentOrgId}/campaigns`;
  const [list, setList] = useState<CampaignSummary[] | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!currentOrgId) return;
    try {
      setList(await apiFetch<CampaignSummary[]>(base));
    } catch (e) {
      setError(describeError(e));
    }
  }, [currentOrgId, base]);

  useEffect(() => {
    load();
  }, [load]);

  async function create(v: CampaignValues) {
    setBusy(true);
    setError('');
    try {
      const c = await apiFetch<Campaign>(base, { method: 'POST', body: JSON.stringify(v) });
      router.push(`/campaigns/${c.id}`);
    } catch (e) {
      setError(describeError(e));
      setBusy(false);
    }
  }

  const visible = (list ?? []).filter((c) => (c.status === 'ARCHIVED') === showArchived);
  const archivedCount = (list ?? []).filter((c) => c.status === 'ARCHIVED').length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Campaigns</h1>
          <p className="text-sm text-muted">
            Group related articles and posts, and follow how far each campaign has come.
          </p>
        </div>
        {canWrite && !creating && (
          <button className="btn-primary" onClick={() => setCreating(true)}>
            <Plus size={16} aria-hidden /> New campaign
          </button>
        )}
      </div>

      {creating && (
        <section className="card p-5">
          <h2 className="mb-3 font-display text-base font-semibold">New campaign</h2>
          <CampaignForm
            submitLabel="Create campaign"
            busy={busy}
            error={error}
            onSubmit={create}
            onCancel={() => {
              setCreating(false);
              setError('');
            }}
          />
        </section>
      )}

      {!creating && error && (
        <p className="rounded-lg border border-red-200 bg-danger-soft p-3 text-sm text-danger-ink">
          {error}
        </p>
      )}

      <div className="flex gap-2 text-sm">
        <button
          className={showArchived ? 'btn-ghost' : 'btn-primary'}
          onClick={() => setShowArchived(false)}
        >
          Active
        </button>
        <button
          className={showArchived ? 'btn-primary' : 'btn-ghost'}
          onClick={() => setShowArchived(true)}
        >
          Archived{archivedCount ? ` (${archivedCount})` : ''}
        </button>
      </div>

      {list === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : visible.length === 0 ? (
        <div className="card p-10 text-center text-sm text-muted">
          <p className="text-3xl">📣</p>
          <p className="mt-2 font-semibold text-slate-700">
            {showArchived ? 'No archived campaigns' : 'No campaigns yet'}
          </p>
          {!showArchived && (
            <p>
              {canWrite
                ? 'Create one to group your articles and posts.'
                : 'Ask an editor to create the first one.'}
            </p>
          )}
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((c) => (
            <li key={c.id}>
              <Link
                href={`/campaigns/${c.id}`}
                className="card block h-full space-y-3 p-5 hover:shadow-lift"
              >
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-display text-base font-semibold" dir="auto">
                    {c.name}
                  </h2>
                  {c.status === 'ARCHIVED' && <span className="chip-draft">Archived</span>}
                </div>
                <p className="text-xs text-muted">{dateRange(c)}</p>
                {c.description && (
                  <p className="line-clamp-2 text-sm text-slate-600" dir="auto">
                    {c.description}
                  </p>
                )}
                <Progress stats={c.stats} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
