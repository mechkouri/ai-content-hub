'use client';

import { Search, Upload, X } from 'lucide-react';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { AuthImage } from '@/components/auth-image';
import { apiFetch, MediaAsset } from '@/lib/api';
import { altFromFilename } from '@/lib/article-images';
import { describeError } from '@/lib/errors';
import { useI18n } from '@/lib/i18n';

export interface PickedPicture {
  assetId: string;
  alt: string;
  caption: string;
}

interface StockImage {
  id: string;
  provider: 'openverse' | 'pexels';
  title: string;
  thumbnail: string;
  imageUrl: string;
  creator: string;
  license: string;
  creditRequired: boolean;
  credit: string;
  alt: string;
}

interface Provider {
  id: 'openverse' | 'pexels';
  name: string;
  available: boolean;
}

type Tab = 'library' | 'free' | 'upload';

/**
 * Choose a picture for an article: from the organization's library, from free picture sites, or by uploading.
 * A free picture is copied into the library (scaled, converted to WebP and named after what it shows) and its
 * credit line comes with it as the caption.
 */
export function PicturePicker({
  orgId,
  onPick,
  onClose,
}: {
  orgId: string;
  onPick: (p: PickedPicture) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const base = `/organizations/${orgId}`;
  const [tab, setTab] = useState<Tab>('free');
  const [library, setLibrary] = useState<MediaAsset[] | null>(null);
  const [providers, setProviders] = useState<Provider[]>([
    { id: 'openverse', name: 'Openverse', available: true },
  ]);
  const [provider, setProvider] = useState<'openverse' | 'pexels'>('openverse');
  const [query, setQuery] = useState('');
  const [searched, setSearched] = useState('');
  const [results, setResults] = useState<StockImage[] | null>(null);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [usingId, setUsingId] = useState('');
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiFetch<MediaAsset[]>(`${base}/media`)
      .then(setLibrary)
      .catch(() => setLibrary([]));
    apiFetch<Provider[]>(`${base}/stock-images/providers`)
      .then((p) => setProviders(p.filter((x) => x.available)))
      .catch(() => undefined);
  }, [base]);

  useEffect(() => {
    dialog.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function search(e?: FormEvent, nextPage = 1) {
    e?.preventDefault();
    const q = (nextPage === 1 ? query : searched).trim();
    if (q.length < 2) return;
    setBusy(true);
    setError('');
    try {
      const found = await apiFetch<StockImage[]>(
        `${base}/stock-images?${new URLSearchParams({ q, provider, page: String(nextPage) })}`,
      );
      setSearched(q);
      setPage(nextPage);
      setResults((prev) => (nextPage === 1 ? found : [...(prev ?? []), ...found]));
    } catch (err) {
      setError(describeError(err));
    }
    setBusy(false);
  }

  async function useFree(img: StockImage) {
    setUsingId(img.id);
    setError('');
    try {
      const r = await apiFetch<{ asset: MediaAsset }>(`${base}/stock-images/import`, {
        method: 'POST',
        body: JSON.stringify({ imageUrl: img.imageUrl, title: img.title || query }),
      });
      onPick({ assetId: r.asset.id, alt: img.alt || img.title, caption: img.credit });
    } catch (err) {
      setError(describeError(err));
      setUsingId('');
    }
  }

  async function upload(file: File) {
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      const asset = await apiFetch<MediaAsset>(`${base}/media`, { method: 'POST', body: form });
      onPick({ assetId: asset.id, alt: altFromFilename(asset.filename), caption: '' });
    } catch (err) {
      setError(describeError(err));
      setBusy(false);
    }
  }

  const tabBtn = (id: Tab, label: string) => (
    <button
      key={id}
      type="button"
      role="tab"
      aria-selected={tab === id}
      onClick={() => setTab(id)}
      className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
        tab === id ? 'bg-brand text-white' : 'bg-slate-200/70 text-slate-700 hover:bg-slate-300/70'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={t('pk.title')}
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl outline-none"
      >
        <div className="flex items-center justify-between gap-3 border-b border-line p-4">
          <h2 className="font-display text-lg font-semibold">{t('pk.title')}</h2>
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost btn-sm"
            aria-label={t('pk.close')}
          >
            <X size={16} aria-hidden />
          </button>
        </div>
        <div className="flex flex-wrap gap-2 px-4 pt-3" role="tablist">
          {tabBtn('free', t('pk.tab.free'))}
          {tabBtn('library', t('pk.tab.library'))}
          {tabBtn('upload', t('pk.tab.upload'))}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {error && (
            <p className="mb-3 rounded-lg border border-red-200 bg-danger-soft p-3 text-sm text-danger-ink">
              {error}
            </p>
          )}

          {tab === 'free' && (
            <>
              <form onSubmit={(e) => search(e)} className="flex flex-wrap gap-2">
                {providers.length > 1 && (
                  <select
                    className="input !w-auto"
                    aria-label={t('pk.provider')}
                    value={provider}
                    onChange={(e) => setProvider(e.target.value as 'openverse' | 'pexels')}
                  >
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                )}
                <input
                  autoFocus
                  className="input min-w-[12rem] flex-1"
                  dir="auto"
                  maxLength={100}
                  placeholder={t('pk.searchPh')}
                  aria-label={t('pk.search')}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <button className="btn-primary" disabled={busy || query.trim().length < 2}>
                  <Search size={15} aria-hidden />{' '}
                  {busy && page === 1 ? t('pk.searching') : t('pk.go')}
                </button>
              </form>
              <p className="mt-2 text-xs text-muted">{t('pk.freeNote')}</p>

              {results && results.length === 0 && (
                <p className="mt-6 text-sm text-muted">{t('pk.none')}</p>
              )}
              {results && results.length > 0 && (
                <>
                  <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {results.map((img) => (
                      <li
                        key={`${img.provider}-${img.id}`}
                        className="overflow-hidden rounded-xl border border-line"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={img.thumbnail}
                          alt={img.alt}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className="h-32 w-full bg-slate-100 object-cover"
                        />
                        <div className="space-y-1 p-2">
                          <p className="line-clamp-2 text-xs font-semibold" dir="auto">
                            {img.title || img.alt || '—'}
                          </p>
                          <p className="text-[11px] text-muted" dir="auto">
                            {img.creator || '—'} · {img.license}
                          </p>
                          {img.creditRequired && (
                            <p className="text-[11px] text-amber-700">{t('pk.creditNote')}</p>
                          )}
                          <button
                            type="button"
                            className="btn-primary btn-sm w-full"
                            disabled={!!usingId}
                            onClick={() => useFree(img)}
                          >
                            {usingId === `${img.id}` ? t('pk.importing') : t('pk.use')}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className="btn-ghost mt-3"
                    disabled={busy}
                    onClick={() => search(undefined, page + 1)}
                  >
                    {busy ? t('pk.searching') : t('pk.more')}
                  </button>
                </>
              )}
            </>
          )}

          {tab === 'library' &&
            (library === null ? (
              <p className="text-sm text-muted">{t('common.loading')}</p>
            ) : library.length === 0 ? (
              <p className="text-sm text-muted">{t('pk.libraryEmpty')}</p>
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {library.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      title={m.filename}
                      onClick={() =>
                        onPick({ assetId: m.id, alt: altFromFilename(m.filename), caption: '' })
                      }
                      className="block w-full overflow-hidden rounded-xl border border-line hover:border-brand"
                    >
                      <AuthImage
                        orgId={orgId}
                        assetId={m.id}
                        alt={m.filename}
                        className="h-28 w-full bg-slate-50 object-cover"
                      />
                      <span className="block truncate p-2 text-xs">{m.filename}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ))}

          {tab === 'upload' && (
            <div className="py-6 text-center">
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
              />
              <button
                type="button"
                className="btn-primary"
                disabled={busy}
                onClick={() => fileInput.current?.click()}
              >
                <Upload size={15} aria-hidden /> {t('pk.chooseFile')}
              </button>
              <p className="mt-2 text-xs text-muted">{t('pk.uploadHint')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
