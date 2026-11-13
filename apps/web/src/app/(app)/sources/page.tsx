'use client';

import { AlignLeft, FileText, Globe } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, canWriteSources, SourceDetail, SourceSummary } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { describeError, describeStoredExtractionError } from '@/lib/errors';
import { useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/lib/i18n/messages';

type Tab = 'text' | 'file' | 'url';
const TABS: { id: Tab; label: MessageKey; icon: string }[] = [
  { id: 'text', label: 'src.tab.text', icon: '📝' },
  { id: 'file', label: 'src.tab.file', icon: '📎' },
  { id: 'url', label: 'src.tab.url', icon: '🔗' },
];

function StatusBadge({ s }: { s: SourceSummary }) {
  const { t } = useI18n();
  if (s.status === 'EXTRACTED') {
    return <span className="chip-ok">{t('src.factsCount', { n: s._count.facts })}</span>;
  }
  return <span className="chip-warn">{t('status.needsExtraction')}</span>;
}

export default function SourcesPage() {
  const router = useRouter();
  const { currentOrgId, currentRole } = useApp();
  const { t, dateLocale } = useI18n();
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
        if (!file) throw new Error(t('src.chooseFileFirst'));
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
      <section className="pb-1">
        <h1 className="font-display text-[28px] font-semibold leading-tight">{t('nav.sources')}</h1>
        <p className="text-sm text-muted">{t('src.subtitle')}</p>
        {error && (
          <p className="mt-3 rounded-lg border border-red-200 bg-danger-soft p-3 text-sm text-danger-ink">
            {error}
          </p>
        )}
      </section>

      {canWrite ? (
        <form onSubmit={submit} className="card space-y-4 p-6">
          <div className="flex flex-wrap gap-2" role="tablist">
            {TABS.map((tb) => (
              <button
                key={tb.id}
                type="button"
                role="tab"
                aria-selected={tab === tb.id}
                disabled={busy}
                onClick={() => {
                  setTab(tb.id);
                  setError('');
                }}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                  tab === tb.id
                    ? 'bg-brand text-white'
                    : 'bg-slate-200/70 text-slate-700 hover:bg-slate-300/70'
                }`}
              >
                {tb.icon} {t(tb.label)}
              </button>
            ))}
          </div>

          {tab === 'text' && (
            <div className="space-y-3">
              <input
                className="input"
                maxLength={150}
                placeholder={t('src.titlePh')}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={busy}
              />
              <textarea
                className="input"
                rows={9}
                placeholder={t('src.textPh')}
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={busy}
                maxLength={200000}
              />
              <p className="text-xs text-slate-400">
                {t('src.chars', { n: text.length.toLocaleString(dateLocale) })}
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
                className="flex w-full flex-col items-center rounded-xl border-2 border-dashed border-slate-300 p-8 text-sm text-muted hover:border-brand hover:text-brand"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
              >
                <span className="text-3xl">📎</span>
                <span className="mt-2 font-semibold">{file ? file.name : t('src.chooseFile')}</span>
                <span className="text-xs">
                  {file ? t('src.kb', { n: (file.size / 1024).toFixed(0) }) : t('src.fileHint')}
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
              <p className="text-xs text-slate-400">{t('src.urlHint')}</p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button className="btn-primary" disabled={busy || !ready}>
              {busy ? t('src.working') : t('src.add')}
            </button>
            {busy && <p className="text-sm text-muted">{t('src.reading')}</p>}
          </div>
        </form>
      ) : (
        <p className="rounded-lg bg-slate-100 p-3 text-sm text-slate-600">{t('src.readOnly')}</p>
      )}

      <section className="card p-6">
        <h2 className="mb-3 font-display text-base font-semibold">{t('src.history')}</h2>
        {list === null ? (
          <p className="text-sm text-muted">{t('common.loading')}</p>
        ) : list.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted">
            <p className="text-3xl">📄</p>
            <p className="mt-2 font-semibold text-slate-700">{t('src.none')}</p>
            <p>{t('src.addFirst')}</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {list.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/sources/${s.id}`}
                  className="flex flex-wrap items-center gap-3 rounded-xl px-2 py-3 hover:bg-surface"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
                    {s.type === 'URL' ? (
                      <Globe size={18} aria-hidden />
                    ) : s.type === 'TEXT' ? (
                      <AlignLeft size={18} aria-hidden />
                    ) : (
                      <FileText size={18} aria-hidden />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{s.title}</p>
                    <p className="text-xs text-slate-400">
                      {t(`src.type.${s.type}` as MessageKey)}
                      {s.language ? ` · ${s.language.toUpperCase()}` : ''}
                      {s.classification ? ` · ${s.classification.replace('_', ' ')}` : ''} ·{' '}
                      {new Date(s.createdAt).toLocaleDateString(dateLocale)}
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
