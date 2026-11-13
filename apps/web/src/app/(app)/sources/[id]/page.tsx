'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, canWriteSources, FACT_KINDS, SourceDetail, SourceFactRow } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { describeError, describeStoredExtractionError } from '@/lib/errors';
import { useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/lib/i18n/messages';

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
  const { t } = useI18n();
  if (f.manual) return <span className="chip-draft">{t('src.trust.manual')}</span>;
  if (f.edited) return <span className="chip-info">{t('src.trust.edited')}</span>;
  if (f.verified) return <span className="chip-ok">{t('src.trust.verified')}</span>;
  return <span className="chip-warn">{t('src.trust.unverified')}</span>;
}

export default function SourceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { currentOrgId, currentRole } = useApp();
  const { t } = useI18n();
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
            t('src.extractFailed'),
        );
      else setNotice(t('src.extracted'));
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
    if (!confirm(t('src.confirmDelete'))) return;
    try {
      await apiFetch(base, { method: 'DELETE' });
      router.replace('/sources');
    } catch (e) {
      setError(describeError(e));
    }
  }

  if (!data) return <p className="text-sm text-muted">{error || t('common.loading')}</p>;
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
        {t('src.back')}
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
                (source.fileName ?? t('src.pasted'))
              )}
              {source.language ? ` · ${source.language.toUpperCase()}` : ''}
              {source.classification ? ` · ${source.classification.replace('_', ' ')}` : ''}
            </p>
          </div>
          {canWrite && (
            <div className="flex flex-wrap gap-2">
              {source.status === 'EXTRACTED' && (
                <Link href={`/studio?sourceId=${source.id}`} className="btn-primary">
                  {t('src.createContent')}
                </Link>
              )}
              <button className="btn-ghost" disabled={extracting} onClick={extract}>
                {extracting
                  ? t('src.extracting')
                  : source.status === 'EXTRACTED'
                    ? t('src.reextract')
                    : t('src.extract')}
              </button>
              <button className="btn-danger" onClick={removeSource}>
                {t('common.delete')}
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
            {t('src.notExtracted')}
            {storedError ? ` ${t('src.lastAttempt', { error: storedError })}` : ''}{' '}
            {canWrite ? t('src.useExtract') : ''}
          </p>
        )}
        {source.truncated && (
          <p className="mt-3 rounded-lg bg-slate-100 p-3 text-xs text-slate-600">
            {t('src.truncated')}
          </p>
        )}
        {unverifiedCount > 0 && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-warn-soft p-3 text-sm text-warn-ink">
            {t(unverifiedCount === 1 ? 'src.unverifiedOne' : 'src.unverifiedMany', {
              n: unverifiedCount,
            })}
          </p>
        )}
      </section>

      {missing.length > 0 && (
        <section className="card p-6">
          <h2 className="font-display text-base font-semibold">{t('src.missingTitle')}</h2>
          <p className="text-sm text-muted">{t('src.missingHint')}</p>
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
                {t(`fact.${k}` as MessageKey)}
                {canWrite ? ` · ${t('src.addShort')}` : ''}
              </button>
            ))}
          </div>
        </section>
      )}

      {grouped.map(({ kind, items }) => (
        <section key={kind} className="card p-6">
          <h2 className="mb-2 font-display text-base font-semibold">
            {t(`fact.${kind}` as MessageKey)}
          </h2>
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
                        {t('common.save')}
                      </button>
                      <button className="btn-ghost" onClick={() => setEditingId(null)}>
                        {t('common.cancel')}
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
                        {highlight === f.id ? t('src.hideInSource') : t('src.showInSource')}
                      </button>
                    )}
                    {canWrite && (
                      <>
                        {!f.verified && (
                          <button
                            className="font-semibold text-green-700"
                            onClick={() => patch(f.id, { verified: true })}
                          >
                            {t('src.isCorrect')}
                          </button>
                        )}
                        <button
                          className="font-semibold text-slate-600"
                          onClick={() => {
                            setEditingId(f.id);
                            setDraft(f.value);
                          }}
                        >
                          {t('common.edit')}
                        </button>
                        <button
                          className="font-semibold text-red-600"
                          onClick={() =>
                            confirm(t('src.confirmDeleteFact')) &&
                            run(() => apiFetch(`${base}/facts/${f.id}`, { method: 'DELETE' }))
                          }
                        >
                          {t('common.delete')}
                        </button>
                      </>
                    )}
                  </div>
                )}
                {f.quote && highlight === f.id && (
                  <blockquote className="border-s-4 border-brand/40 bg-slate-50 p-2 text-xs italic text-slate-600">
                    “{f.quote}”
                  </blockquote>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {source.status === 'EXTRACTED' && facts.length === 0 && (
        <p className="rounded-lg bg-slate-100 p-3 text-sm text-slate-600">{t('src.noFacts')}</p>
      )}

      {canWrite && (
        <form id="add-fact" onSubmit={addFact} className="card flex flex-wrap items-end gap-3 p-6">
          <div className="w-full">
            <h2 className="font-display text-base font-semibold">{t('src.addYourself')}</h2>
            <p className="text-sm text-muted">{t('src.addYourselfHint')}</p>
          </div>
          <label className="text-xs font-semibold text-slate-600">
            {t('src.type')}
            <select
              className="input mt-1 !w-auto"
              value={newKind}
              onChange={(e) => setNewKind(e.target.value)}
            >
              {FACT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`fact.${k}` as MessageKey)}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-[200px] flex-1 text-xs font-semibold text-slate-600">
            {t('src.value')}
            <input
              className="input mt-1"
              maxLength={500}
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder={t('src.valuePh')}
            />
          </label>
          <button className="btn-primary" disabled={!newValue.trim()}>
            {t('src.addFact')}
          </button>
        </form>
      )}

      <section className="card p-6">
        <button
          className="flex w-full items-center justify-between text-start font-bold"
          onClick={() => setShowText((v) => !v)}
          aria-expanded={showText}
        >
          {t('src.originalText')}
          <span className="text-sm font-normal text-slate-400">
            {showText ? t('common.hide') : t('common.show')}
          </span>
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
