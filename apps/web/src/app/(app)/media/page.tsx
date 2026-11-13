'use client';

import { ChangeEvent, DragEvent, useCallback, useEffect, useRef, useState } from 'react';
import { AuthImage } from '@/components/auth-image';
import { apiFetch, canDeleteMedia, canUploadMedia, MediaAsset } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { useI18n } from '@/lib/i18n';

export default function MediaPage() {
  const { currentOrgId, currentRole } = useApp();
  const { t } = useI18n();
  const fmtSize = (n: number) =>
    n > 1024 * 1024
      ? t('media.mb', { n: (n / 1024 / 1024).toFixed(1) })
      : t('media.kb', { n: Math.max(1, Math.round(n / 1024)) });
  const [assets, setAssets] = useState<MediaAsset[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!currentOrgId) return;
    try {
      setAssets(await apiFetch<MediaAsset[]>(`/organizations/${currentOrgId}/media`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [currentOrgId]);

  useEffect(() => {
    setAssets(null);
    load();
  }, [load]);

  async function upload(files: FileList | File[]) {
    setError('');
    setBusy(true);
    for (const file of Array.from(files)) {
      if (file.size > 5 * 1024 * 1024) {
        setError(t('media.tooBig', { name: file.name }));
        continue;
      }
      try {
        const form = new FormData();
        form.append('file', file);
        await apiFetch(`/organizations/${currentOrgId}/media`, { method: 'POST', body: form });
      } catch (e) {
        setError(`${file.name}: ${(e as Error).message}`);
      }
    }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = '';
    await load();
  }

  async function remove(a: MediaAsset) {
    if (!confirm(t('media.confirmDelete', { name: a.filename }))) return;
    setError('');
    try {
      await apiFetch(`/organizations/${currentOrgId}/media/${a.id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const canUpload = canUploadMedia(currentRole);
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (canUpload && e.dataTransfer.files.length) upload(e.dataTransfer.files);
  };

  return (
    <div className="space-y-4">
      <section className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">{t('media.title')}</h1>
            <p className="text-sm text-slate-500">{t('media.subtitle')}</p>
          </div>
          {canUpload && (
            <>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  e.target.files && upload(e.target.files)
                }
              />
              <button
                className="btn-primary"
                disabled={busy}
                onClick={() => inputRef.current?.click()}
              >
                {busy ? t('media.uploading') : t('media.upload')}
              </button>
            </>
          )}
        </div>
        {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      </section>

      <section
        className={`card p-6 transition ${dragging ? 'ring-2 ring-brand' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          if (canUpload) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        {assets === null ? (
          <p className="text-sm text-slate-500">{t('common.loading')}</p>
        ) : assets.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500">
            <p className="text-3xl">🖼️</p>
            <p className="mt-2 font-semibold text-slate-700">{t('media.none')}</p>
            <p>{canUpload ? t('media.dragHint') : t('media.askUpload')}</p>
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {assets.map((a) => (
              <li key={a.id} className="group overflow-hidden rounded-xl border border-slate-200">
                <AuthImage
                  orgId={currentOrgId!}
                  assetId={a.id}
                  alt={a.filename}
                  className="h-36 w-full bg-slate-50 object-contain"
                />
                <div className="flex items-center justify-between gap-2 p-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold" title={a.filename}>
                      {a.filename}
                    </p>
                    <p className="text-[11px] text-slate-400">{fmtSize(a.sizeBytes)}</p>
                  </div>
                  {canDeleteMedia(currentRole) && (
                    <button
                      className="btn-danger btn-sm"
                      onClick={() => remove(a)}
                      aria-label={t('media.deleteLabel', { name: a.filename })}
                    >
                      {t('common.delete')}
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
