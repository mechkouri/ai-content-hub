'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  apiFetch,
  canWriteSources,
  FACT_KINDS,
  FACT_LABELS,
  SourceDetail,
  SourceFactRow,
} from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { describeError, describeStoredExtractionError } from '@/lib/errors';

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Finds where a quote sits in the original text (case and whitespace tolerant). */
function locate(text: string, quote: string): [number, number] | null {
  const q = quote.trim();
  if (!q) return null;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i >= 0) return [i, i + q.length];
  const pattern = q.split(/\s+/).map(escapeRegExp).join('\\s+');
  try {
    const m = new RegExp(pattern, 'i').exec(text);
    return m ? [m.index, m.index + m[0].length] : null;
  } catch {
    return null;
  }
}

function Trust({ f }: { f: SourceFactRow }) {
  if (f.manual) return <span className="chip-draft">Added by you</span>;
  if (f.edited) return <span className="chip-info">Edited by you</span>;
  if (f.verified) return <span className="chip-ok">✓ Found in source</span>;
  return <span className="chip-warn">⚠ Not found in source — check it</span>;
}

export default function SourceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { currentOrgId, currentRole } = useApp();
  const canWrite = canWriteSources(currentRole);
  const base = `/organizations/${currentOrgId}/sources/${id}`;

  const [data, setData] = useState<SourceDetail | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [highlight, setHighlight] = useState<string | null>(null);
  const [showText, setShowText] = useState(false);
  const [newKind, setNewKind] = useState<string>('contact');
  const [newValue, setNewValue] = useState('');
  const markRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    if (!currentOrgId) return;
    try {
      setData(await apiFetch<SourceDetail>(base));
    } catch (e) {
      setError(describeError(e));
    }
  }, [currentOrgId, base]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (highlight && markRef.current)
      markRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [highlight, showText]);

  async function run<T>(fn: () => Promise<T>) {
    setError('');
    setNotice('');
    try {
      await fn();
      await load();
    } catch (e) {
      setError(describeError(e));
    }
  }

  async function extract() {
    setExtracting(true);
    setError('');
    setNotice('');
    try {
      const res = await apiFetch<SourceDetail>(`${base}/extract`, { method: 'POST' });
      setData(res);
      if (res.extraction && !res.extraction.ok)
        setError(
          describeStoredExtractionError(`${res.extraction.code}: ${res.extraction.message}`) ??
            'Extraction failed.',
        );
      else setNotice('Facts extracted. Please review them below.');
    } catch (e) {
      setError(describeError(e));
    }
    setExtracting(false);
  }

  const patch = (factId: string, body: object) =>
    run(() => apiFetch(`${base}/facts/${factId}`, { method: 'PATCH', body: JSON.stringify(body) }));

  async function saveEdit(factId: string) {
    if (!draft.trim()) return;
    await patch(factId, { value: draft.trim() });
    setEditingId(null);
  }

  async function addFact(e: FormEvent) {
    e.preventDefault();
    if (!newValue.trim()) return;
    await run(() =>
      apiFetch(`${base}/facts`, {
        method: 'POST',
        body: JSON.stringify({ kind: newKind, value: newValue.trim() }),
      }),
    );
    setNewValue('');
  }

  async function removeSource() {
    if (!confirm('Delete this source and all its facts? This cannot be undone.')) return;
    try {
      await apiFetch(base, { method: 'DELETE' });
      router.replace('/sources');
    } catch (e) {
      setError(describeError(e));
    }
  }

  if (!data) return <p className="text-sm text-muted">{error || 'Loading…'}</p>;
  const { source, facts, missing, unverifiedCount } = data;
  const activeFact = facts.find((f) => f.id === highlight);
  const range = activeFact?.quote ? locate(source.originalText, activeFact.quote) : null;
  const grouped = FACT_KINDS.map((k) => ({
    kind: k,
    items: facts.filter((f) => f.kind === k),
  })).filter((g) => g.items.length);
  const storedError = describeStoredExtractionError(source.extractionError);

  return (
    <div className="space-y-4">
      <Link href="/sources" className="text-sm font-semibold text-brand">
        ← All sources
      </Link>

      <section className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-semibold">{source.title}</h1>
            <p className="mt-1 text-sm text-muted">
              {source.type === 'URL' && source.url ? (
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand underline"
                >
                  {source.url}
                </a>
              ) : (
                (source.fileName ?? 'Pasted text')
              )}
              {source.language ? ` · ${source.language.toUpperCase()}` : ''}
              {source.classification ? ` · ${source.classification.replace('_', ' ')}` : ''}
            </p>
          </div>
          {canWrite && (
            <div className="flex flex-wrap gap-2">
              {source.status === 'EXTRACTED' && (
                <Link href={`/studio?sourceId=${source.id}`} className="btn-primary">
                  ✍️ Create content
                </Link>
              )}
              <button className="btn-ghost" disabled={extracting} onClick={extract}>
                {extracting
                  ? 'Extracting…'
                  : source.status === 'EXTRACTED'
                    ? 'Re-extract facts'
                    : 'Extract facts'}
              </button>
              <button className="btn-danger" onClick={removeSource}>
                Delete
              </button>
            </div>
          )}
        </div>
        {source.summary && <p className="mt-3 text-sm text-slate-700">{source.summary}</p>}
        {error && (
          <p className="mt-3 rounded-lg border border-red-200 bg-danger-soft p-3 text-sm text-danger-ink">
            {error}
          </p>
        )}
        {notice && (
          <p className="mt-3 rounded-lg border border-green-200 bg-ok-soft p-3 text-sm text-ok-ink">
            {notice}
          </p>
        )}
        {source.status !== 'EXTRACTED' && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-warn-soft p-3 text-sm text-warn-ink">
            Your content is saved, but facts have not been extracted yet.
            {storedError ? ` Last attempt: ${storedError}` : ''}{' '}
            {canWrite ? 'Use “Extract facts” to try again.' : ''}
          </p>
        )}
        {source.truncated && (
          <p className="mt-3 rounded-lg bg-slate-100 p-3 text-xs text-slate-600">
            This document is long: only the first part was analysed. Add any missing facts manually.
          </p>
        )}
        {unverifiedCount > 0 && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-warn-soft p-3 text-sm text-warn-ink">
            {unverifiedCount} fact{unverifiedCount > 1 ? 's' : ''} could not be matched to the
            original text. Please confirm, edit or delete them before using them.
          </p>
        )}
      </section>

      {missing.length > 0 && (
        <section className="card p-6">
          <h2 className="font-display text-base font-semibold">Possibly missing information</h2>
          <p className="text-sm text-muted">
            This kind of document usually includes the following, but we did not find it. We will
            never invent it.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {missing.map((k) => (
              <button
                key={k}
                type="button"
                disabled={!canWrite}
                onClick={() => {
                  setNewKind(k);
                  document.getElementById('add-fact')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-200 disabled:cursor-default"
              >
                {FACT_LABELS[k] ?? k}
                {canWrite ? ' · add' : ''}
              </button>
            ))}
          </div>
        </section>
      )}

      {grouped.map(({ kind, items }) => (
        <section key={kind} className="card p-6">
          <h2 className="mb-2 font-display text-base font-semibold">{FACT_LABELS[kind]}</h2>
          <ul className="divide-y divide-slate-100">
            {items.map((f) => (
              <li key={f.id} className="space-y-2 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  {editingId === f.id ? (
                    <div className="flex min-w-0 flex-1 gap-2">
                      <input
                        className="input"
                        value={draft}
                        maxLength={500}
                        autoFocus
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && saveEdit(f.id)}
                      />
                      <button className="btn-primary" onClick={() => saveEdit(f.id)}>
                        Save
                      </button>
                      <button className="btn-ghost" onClick={() => setEditingId(null)}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <p className="min-w-0 flex-1 break-words text-sm font-medium">{f.value}</p>
                  )}
                  {editingId !== f.id && <Trust f={f} />}
                </div>
                {editingId !== f.id && (
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    {f.quote && (
                      <button
                        className="font-semibold text-brand"
                        onClick={() => {
                          setHighlight(highlight === f.id ? null : f.id);
                          setShowText(true);
                        }}
                      >
                        {highlight === f.id ? 'Hide in source' : 'Show in source'}
                      </button>
                    )}
                    {canWrite && (
                      <>
                        {!f.verified && (
                          <button
                            className="font-semibold text-green-700"
                            onClick={() => patch(f.id, { verified: true })}
                          >
                            This is correct
                          </button>
                        )}
                        <button
                          className="font-semibold text-slate-600"
                          onClick={() => {
                            setEditingId(f.id);
                            setDraft(f.value);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          className="font-semibold text-red-600"
                          onClick={() =>
                            confirm('Delete this fact?') &&
                            run(() => apiFetch(`${base}/facts/${f.id}`, { method: 'DELETE' }))
                          }
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                )}
                {f.quote && highlight === f.id && (
                  <blockquote className="border-l-4 border-brand/40 bg-slate-50 p-2 text-xs italic text-slate-600">
                    “{f.quote}”
                  </blockquote>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {source.status === 'EXTRACTED' && facts.length === 0 && (
        <p className="rounded-lg bg-slate-100 p-3 text-sm text-slate-600">
          No facts were found in this document.
        </p>
      )}

      {canWrite && (
        <form id="add-fact" onSubmit={addFact} className="card flex flex-wrap items-end gap-3 p-6">
          <div className="w-full">
            <h2 className="font-display text-base font-semibold">Add a fact yourself</h2>
            <p className="text-sm text-muted">
              Facts you add are marked as yours and are kept when facts are re-extracted.
            </p>
          </div>
          <label className="text-xs font-semibold text-slate-600">
            Type
            <select
              className="input mt-1 !w-auto"
              value={newKind}
              onChange={(e) => setNewKind(e.target.value)}
            >
              {FACT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {FACT_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-[200px] flex-1 text-xs font-semibold text-slate-600">
            Value
            <input
              className="input mt-1"
              maxLength={500}
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder="e.g. admissions@school.example"
            />
          </label>
          <button className="btn-primary" disabled={!newValue.trim()}>
            Add fact
          </button>
        </form>
      )}

      <section className="card p-6">
        <button
          className="flex w-full items-center justify-between text-left font-bold"
          onClick={() => setShowText((v) => !v)}
          aria-expanded={showText}
        >
          Original text
          <span className="text-sm font-normal text-slate-400">{showText ? 'Hide' : 'Show'}</span>
        </button>
        {showText && (
          <div
            className="mt-3 max-h-96 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-sm leading-relaxed"
            dir="auto"
          >
            {range ? (
              <>
                {source.originalText.slice(0, range[0])}
                <mark ref={markRef} className="rounded bg-yellow-200 px-0.5">
                  {source.originalText.slice(range[0], range[1])}
                </mark>
                {source.originalText.slice(range[1])}
              </>
            ) : (
              source.originalText
            )}
          </div>
        )}
      </section>
    </div>
  );
}
