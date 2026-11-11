'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, canWriteSources, SourceDetail, SourceSummary } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { describeError, describeStoredExtractionError } from '@/lib/errors';

type Tab = 'text' | 'file' | 'url';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'text', label: 'Paste text', icon: '📝' },
  { id: 'file', label: 'Upload PDF / DOCX', icon: '📎' },
  { id: 'url', label: 'Web page', icon: '🔗' },
];

const TYPE_LABEL: Record<string, string> = {
  TEXT: 'Text',
  PDF: 'PDF',
  DOCX: 'DOCX',
  URL: 'Web page',
};

function StatusBadge({ s }: { s: SourceSummary }) {
  if (s.status === 'EXTRACTED')
    return (
      <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800">
        {s._count.facts} facts
      </span>
    );
  return (
    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
      Needs extraction
    </span>
  );
}

export default function SourcesPage() {
  const router = useRouter();
  const { currentOrgId, currentRole } = useApp();
  const canWrite = canWriteSources(currentRole);
  const [list, setList] = useState<SourceSummary[] | null>(null);
  const [tab, setTab] = useState<Tab>('text');
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const base = `/organizations/${currentOrgId}/sources`;

  const load = useCallback(async () => {
    if (!currentOrgId) return;
    try {
      setList(await apiFetch<SourceSummary[]>(base));
    } catch (e) {
      setError(describeError(e));
    }
  }, [currentOrgId, base]);

  useEffect(() => {
    setList(null);
    load();
  }, [load]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      let result: SourceDetail;
      if (tab === 'text') {
        result = await apiFetch(`${base}/text`, {
          method: 'POST',
          body: JSON.stringify({ text, title: title.trim() || undefined }),
        });
      } else if (tab === 'url') {
        result = await apiFetch(`${base}/url`, {
          method: 'POST',
          body: JSON.stringify({ url: url.trim() }),
        });
      } else {
        if (!file) throw new Error('Choose a PDF or DOCX file first.');
        const form = new FormData();
        form.append('file', file);
        result = await apiFetch(`${base}/file`, { method: 'POST', body: form });
      }
      router.push(`/sources/${result.source.id}`);
    } catch (e) {
      setError(describeError(e));
      setBusy(false);
    }
  }

  const ready =
    tab === 'text'
      ? text.trim().length >= 20
      : tab === 'url'
        ? /^https?:\/\//i.test(url.trim())
        : !!file;

  return (
    <div className="space-y-4">
      <section className="card p-6">
        <h1 className="text-xl font-bold">Sources</h1>
        <p className="text-sm text-slate-500">
          Start from an announcement, document or web page. We extract the key facts so everything
          you create stays accurate.
        </p>
        {error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      </section>

      {canWrite ? (
        <form onSubmit={submit} className="card space-y-4 p-6">
          <div className="flex flex-wrap gap-2" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                disabled={busy}
                onClick={() => {
                  setTab(t.id);
                  setError('');
                }}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                  tab === t.id
                    ? 'bg-brand text-white'
                    : 'bg-slate-200/70 text-slate-700 hover:bg-slate-300/70'
                }`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {tab === 'text' && (
            <div className="space-y-3">
              <input
                className="input"
                maxLength={150}
                placeholder="Title (optional)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={busy}
              />
              <textarea
                className="input"
                rows={9}
                placeholder="Paste the announcement, article or notes here (French, Arabic or English)…"
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={busy}
                maxLength={200000}
              />
              <p className="text-xs text-slate-400">
                {text.length.toLocaleString()} / 200,000 characters
              </p>
            </div>
          )}

          {tab === 'file' && (
            <div>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden"
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setFile(e.target.files?.[0] ?? null)
                }
              />
              <button
                type="button"
                className="flex w-full flex-col items-center rounded-xl border-2 border-dashed border-slate-300 p-8 text-sm text-slate-500 hover:border-brand hover:text-brand"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
              >
                <span className="text-3xl">📎</span>
                <span className="mt-2 font-semibold">
                  {file ? file.name : 'Choose a PDF or DOCX file'}
                </span>
                <span className="text-xs">
                  {file
                    ? `${(file.size / 1024).toFixed(0)} KB`
                    : 'Up to 10 MB. Scanned images are not supported yet.'}
                </span>
              </button>
            </div>
          )}

          {tab === 'url' && (
            <div className="space-y-2">
              <input
                className="input"
                type="url"
                placeholder="https://example.com/news/open-day"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={busy}
              />
              <p className="text-xs text-slate-400">
                Public web pages only. Pages that block automated access can’t be imported: paste
                the text instead.
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button className="btn-primary" disabled={busy || !ready}>
              {busy ? 'Working…' : 'Add source & extract facts'}
            </button>
            {busy && (
              <p className="text-sm text-slate-500">
                Reading your content and extracting facts. This can take up to a minute.
              </p>
            )}
          </div>
        </form>
      ) : (
        <p className="rounded-lg bg-slate-100 p-3 text-sm text-slate-600">
          You have read-only access. Owners, admins, editors and designers can add sources.
        </p>
      )}

      <section className="card p-6">
        <h2 className="mb-3 font-bold">History</h2>
        {list === null ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : list.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500">
            <p className="text-3xl">📄</p>
            <p className="mt-2 font-semibold text-slate-700">No sources yet</p>
            <p>Add your first one above.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {list.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/sources/${s.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-3 hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{s.title}</p>
                    <p className="text-xs text-slate-400">
                      {TYPE_LABEL[s.type]}
                      {s.language ? ` · ${s.language.toUpperCase()}` : ''}
                      {s.classification ? ` · ${s.classification.replace('_', ' ')}` : ''} ·{' '}
                      {new Date(s.createdAt).toLocaleDateString()}
                    </p>
                    {s.status !== 'EXTRACTED' && s.extractionError && (
                      <p className="mt-0.5 text-xs text-amber-700">
                        {describeStoredExtractionError(s.extractionError)}
                      </p>
                    )}
                  </div>
                  <StatusBadge s={s} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
