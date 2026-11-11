'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  apiFetch,
  canWriteContent,
  CONTENT_KINDS,
  ContentDetail,
  ApprovalStatus,
  ContentKind,
  ContentSummary,
  GenerateOptions,
  LANG_LABELS,
  Lang,
  SourceDetail,
  SourceSummary,
  STYLE_OPTIONS,
  TONE_OPTIONS,
} from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { KindBadge } from '@/components/dashboard/widgets';
import { ApprovalBadge } from '@/components/studio/approval';
import { StatusBadge } from '@/components/studio/status-badge';
import { describeError } from '@/lib/errors';

const KIND_LABEL = Object.fromEntries(CONTENT_KINDS.map((k) => [k.id, k]));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function StudioPage() {
  const router = useRouter();
  const { currentOrgId, currentRole } = useApp();
  const canWrite = canWriteContent(currentRole);
  const base = `/organizations/${currentOrgId}`;

  const [sources, setSources] = useState<SourceSummary[] | null>(null);
  const [pieces, setPieces] = useState<ContentSummary[] | null>(null);
  const [sourceId, setSourceId] = useState('');
  const [facts, setFacts] = useState<{ verified: number; unverified: number } | null>(null);
  const [kind, setKind] = useState<ContentKind>('ARTICLE');
  const [language, setLanguage] = useState<'' | Lang>('');
  const [style, setStyle] = useState('informative');
  const [tone, setTone] = useState('professional');
  const [length, setLength] = useState<GenerateOptions['length']>('medium');
  const [audience, setAudience] = useState('');
  const [keyword, setKeyword] = useState('');
  const [instructions, setInstructions] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [filterKind, setFilterKind] = useState<'' | ContentKind>('');
  const [filterApproval, setFilterApproval] = useState<'' | ApprovalStatus>('');

  const load = useCallback(async () => {
    if (!currentOrgId) return;
    try {
      const [src, content] = await Promise.all([
        apiFetch<SourceSummary[]>(`${base}/sources`),
        apiFetch<ContentSummary[]>(`${base}/content`),
      ]);
      const ready = src.filter((s) => s.status === 'EXTRACTED');
      setSources(ready);
      setPieces(content);
      const params = new URLSearchParams(window.location.search);
      const wanted = params.get('sourceId');
      // Quick-create shortcuts (dashboard) pass ?kind=ARTICLE|INSTAGRAM|FACEBOOK|LINKEDIN.
      const wantedKind = CONTENT_KINDS.find((k) => k.id === params.get('kind'));
      if (wantedKind) setKind(wantedKind.id);
      setSourceId((cur) => cur || (ready.find((s) => s.id === wanted) ?? ready[0])?.id || '');
    } catch (e) {
      setError(describeError(e));
    }
  }, [currentOrgId, base]);

  useEffect(() => {
    load();
  }, [load]);

  // Show how many verified facts the selected source can provide.
  useEffect(() => {
    setFacts(null);
    if (!sourceId || !currentOrgId) return;
    let live = true;
    apiFetch<SourceDetail>(`${base}/sources/${sourceId}`)
      .then(
        (d) =>
          live &&
          setFacts({ verified: d.facts.length - d.unverifiedCount, unverified: d.unverifiedCount }),
      )
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [sourceId, currentOrgId, base]);

  async function generate(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const options: Record<string, unknown> = {
      style,
      tone,
      length,
      ...(language ? { language } : {}),
      ...(audience.trim() ? { audience: audience.trim() } : {}),
      ...(kind === 'ARTICLE' && keyword.trim() ? { primaryKeyword: keyword.trim() } : {}),
      ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
    };
    try {
      const res = await apiFetch<ContentDetail>(`${base}/content/generate`, {
        method: 'POST',
        body: JSON.stringify({ sourceId, kind, options }),
      });
      router.push(`/studio/${res.piece.id}`);
    } catch (e) {
      setError(describeError(e));
      setBusy(false);
    }
  }

  const noFacts = facts !== null && facts.verified === 0;
  const visible = (pieces ?? []).filter(
    (p) =>
      (!filterKind || p.kind === filterKind) &&
      (!filterApproval || p.approvalStatus === filterApproval),
  );

  return (
    <div className="space-y-4">
      <section className="pb-1">
        <h1 className="font-display text-[28px] font-semibold leading-tight">Content studio</h1>
        <p className="text-sm text-muted">
          Turn a verified source into an article or social posts. We only use facts you have
          verified, and we flag anything that does not match them.
        </p>
        {error && (
          <p className="mt-3 rounded-lg border border-red-200 bg-danger-soft p-3 text-sm text-danger-ink">
            {error}
          </p>
        )}
      </section>

      {canWrite ? (
        sources && sources.length === 0 ? (
          <section className="card p-6 text-sm text-slate-600">
            <p className="font-semibold text-slate-800">You need a source first</p>
            <p className="mt-1">
              Add a source and extract its facts, then come back to create content.
            </p>
            <Link href="/sources" className="btn-primary mt-3">
              Go to Sources
            </Link>
          </section>
        ) : (
          <form onSubmit={generate} className="card space-y-5 p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="font-semibold">Source</span>
                <select
                  className="input mt-1"
                  value={sourceId}
                  onChange={(e) => setSourceId(e.target.value)}
                  disabled={busy}
                >
                  {(sources ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              </label>
              <div className="text-sm">
                <span className="font-semibold">Facts we will use</span>
                <p className="mt-2 text-slate-600">
                  {facts === null ? (
                    'Checking…'
                  ) : (
                    <>
                      <span className="font-semibold text-green-700">
                        {facts.verified} verified
                      </span>
                      {facts.unverified > 0 && (
                        <>
                          {' · '}
                          <span className="font-semibold text-amber-700">
                            {facts.unverified} unverified (not used)
                          </span>{' '}
                          <Link href={`/sources/${sourceId}`} className="text-brand underline">
                            review
                          </Link>
                        </>
                      )}
                    </>
                  )}
                </p>
                {noFacts && (
                  <p className="mt-1 text-xs text-amber-700">
                    Confirm or add facts on the source first.
                  </p>
                )}
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold">What do you want to create?</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {CONTENT_KINDS.map((k) => (
                  <button
                    key={k.id}
                    type="button"
                    disabled={busy}
                    onClick={() => setKind(k.id)}
                    aria-pressed={kind === k.id}
                    className={`rounded-xl border-2 p-4 text-left transition ${
                      kind === k.id
                        ? 'border-brand bg-brand-soft'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <KindBadge kind={k.id} />
                    <p className="mt-1 font-semibold">{k.label}</p>
                    <p className="text-xs text-muted">{k.blurb}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="block text-sm">
                <span className="font-semibold">Language</span>
                <select
                  className="input mt-1"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as '' | Lang)}
                  disabled={busy}
                >
                  <option value="">Automatic (brand default)</option>
                  {Object.entries(LANG_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="font-semibold">Writing style</span>
                <select
                  className="input mt-1"
                  value={style}
                  onChange={(e) => setStyle(e.target.value)}
                  disabled={busy}
                >
                  {STYLE_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {cap(s)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="font-semibold">Tone</span>
                <select
                  className="input mt-1"
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  disabled={busy}
                >
                  {TONE_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {cap(s)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="font-semibold">Length</span>
                <select
                  className="input mt-1"
                  value={length}
                  onChange={(e) => setLength(e.target.value as GenerateOptions['length'])}
                  disabled={busy}
                >
                  <option value="short">Short</option>
                  <option value="medium">Medium</option>
                  <option value="long">Long</option>
                </select>
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="font-semibold">Target audience</span>
                <input
                  className="input mt-1"
                  maxLength={150}
                  placeholder="e.g. future students and their parents"
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                  disabled={busy}
                />
              </label>
              {kind === 'ARTICLE' && (
                <label className="block text-sm">
                  <span className="font-semibold">Primary SEO keyword</span>
                  <input
                    className="input mt-1"
                    maxLength={80}
                    placeholder="e.g. open day Rabat"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    disabled={busy}
                  />
                </label>
              )}
            </div>
            <label className="block text-sm">
              <span className="font-semibold">Extra instructions</span>
              <textarea
                className="input mt-1"
                rows={2}
                maxLength={500}
                placeholder="Optional. e.g. mention that places are limited"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                disabled={busy}
              />
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <button className="btn-primary" disabled={busy || !sourceId || noFacts}>
                {busy ? 'Writing…' : `Create ${KIND_LABEL[kind].label.toLowerCase()}`}
              </button>
              {busy && (
                <p className="text-sm text-muted">
                  The AI is writing from your verified facts. This can take up to a minute.
                </p>
              )}
            </div>
          </form>
        )
      ) : (
        <p className="rounded-lg bg-slate-100 p-3 text-sm text-slate-600">
          You have read-only access. Owners, admins, editors and designers can create content.
        </p>
      )}

      <section className="card p-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-base font-semibold">Your content</h2>
          <div className="flex flex-wrap gap-2">
            <select
              className="input !w-auto"
              value={filterApproval}
              onChange={(e) => setFilterApproval(e.target.value as '' | ApprovalStatus)}
              aria-label="Filter by approval"
            >
              <option value="">Any approval state</option>
              <option value="IN_REVIEW">In review</option>
              <option value="CHANGES_REQUESTED">Changes requested</option>
              <option value="APPROVED">Approved</option>
              <option value="DRAFT">Not submitted</option>
            </select>
            <select
              className="input !w-auto"
              value={filterKind}
              onChange={(e) => setFilterKind(e.target.value as '' | ContentKind)}
              aria-label="Filter by type"
            >
              <option value="">All types</option>
              {CONTENT_KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {pieces === null ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : visible.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted">
            <p className="text-3xl">✍️</p>
            <p className="mt-2 font-semibold text-slate-700">Nothing here yet</p>
            <p>Create your first article or post above.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {visible.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/studio/${p.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-3 hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold" dir="auto">
                      {p.title}
                    </p>
                    <p className="text-xs text-slate-400">
                      {KIND_LABEL[p.kind].icon} {KIND_LABEL[p.kind].label} ·{' '}
                      {LANG_LABELS[p.language] ?? p.language}
                      {p.translatedFromId ? ' · translation' : ''}
                      {p.edited ? ' · edited' : ''} · {new Date(p.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {p.warnings.length > 0 && (
                      <span className="text-xs text-amber-700">{p.warnings.length} to check</span>
                    )}
                    <StatusBadge status={p.status} />
                    <ApprovalBadge status={p.approvalStatus} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
