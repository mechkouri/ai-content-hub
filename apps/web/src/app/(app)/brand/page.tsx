'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { AuthImage } from '@/components/auth-image';
import { ApiError, apiFetch, BrandKit, canWriteBrand, MediaAsset } from '@/lib/api';
import { useApp } from '@/lib/app-context';

const SOCIALS = ['facebook', 'instagram', 'linkedin', 'x', 'youtube', 'tiktok'] as const;
const FONTS = [
  'Inter',
  'Poppins',
  'Montserrat',
  'Roboto',
  'Playfair Display',
  'Cairo',
  'Tajawal',
  'Noto Sans Arabic',
];

interface FormState {
  label: string;
  description: string;
  websiteUrl: string;
  defaultLanguage: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  headingFont: string;
  bodyFont: string;
  imageStyle: string;
  socialUrls: Record<string, string>;
  mainLogoId: string;
  altLogoId: string;
}

const EMPTY: FormState = {
  label: '',
  description: '',
  websiteUrl: '',
  defaultLanguage: 'en',
  primaryColor: '#1877F2',
  secondaryColor: '#0F172A',
  accentColor: '#F59E0B',
  headingFont: 'Inter',
  bodyFont: 'Inter',
  imageStyle: '',
  socialUrls: {},
  mainLogoId: '',
  altLogoId: '',
};

const fromKit = (k: BrandKit): FormState => ({
  label: '',
  description: k.description ?? '',
  websiteUrl: k.websiteUrl ?? '',
  defaultLanguage: k.defaultLanguage,
  primaryColor: k.primaryColor,
  secondaryColor: k.secondaryColor,
  accentColor: k.accentColor,
  headingFont: k.headingFont,
  bodyFont: k.bodyFont,
  imageStyle: k.imageStyle ?? '',
  socialUrls: k.socialUrls ?? {},
  mainLogoId: k.mainLogoId ?? '',
  altLogoId: k.altLogoId ?? '',
});

export default function BrandPage() {
  const { currentOrgId, currentRole, memberships } = useApp();
  const orgName =
    memberships.find((m) => m.organizationId === currentOrgId)?.organization.name ??
    'Your organization';
  const canWrite = canWriteBrand(currentRole);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [versions, setVersions] = useState<BrandKit[]>([]);
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!currentOrgId) return;
    setLoaded(false);
    try {
      const [list, assets] = await Promise.all([
        apiFetch<BrandKit[]>(`/organizations/${currentOrgId}/brand-kits`),
        apiFetch<MediaAsset[]>(`/organizations/${currentOrgId}/media`),
      ]);
      setVersions(list);
      setMedia(assets);
      const active = list.find((k) => k.isActive);
      setForm(active ? fromKit(active) : EMPTY);
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 404)) setError((e as Error).message);
    }
    setLoaded(true);
  }, [currentOrgId]);

  useEffect(() => {
    load();
  }, [load]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    const socialUrls = Object.fromEntries(
      Object.entries(form.socialUrls).filter(([, v]) => v.trim()),
    );
    const body = {
      label: form.label || undefined,
      description: form.description || undefined,
      websiteUrl: form.websiteUrl || undefined,
      defaultLanguage: form.defaultLanguage,
      primaryColor: form.primaryColor,
      secondaryColor: form.secondaryColor,
      accentColor: form.accentColor,
      headingFont: form.headingFont,
      bodyFont: form.bodyFont,
      imageStyle: form.imageStyle || undefined,
      socialUrls,
      mainLogoId: form.mainLogoId || null,
      altLogoId: form.altLogoId || null,
    };
    try {
      const kit = await apiFetch<BrandKit>(`/organizations/${currentOrgId}/brand-kits`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setNotice(`Saved as version ${kit.version} and set active.`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
    setSaving(false);
  }

  async function activate(id: string) {
    setError('');
    setNotice('');
    try {
      await apiFetch(`/organizations/${currentOrgId}/brand-kits/${id}/activate`, {
        method: 'POST',
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!loaded) return <p className="text-sm text-slate-500">Loading…</p>;
  const dis = !canWrite;
  const logoId = form.mainLogoId || form.altLogoId;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <form onSubmit={save} className="space-y-4">
        <section className="card p-6">
          <h1 className="text-xl font-bold">Brand kit</h1>
          <p className="text-sm text-slate-500">
            Applied automatically to AI-generated content and designs.{' '}
            {versions.length === 0
              ? 'No brand kit yet — set up the first one below.'
              : `Active: version ${versions.find((k) => k.isActive)?.version}.`}
          </p>
          {!canWrite && (
            <p className="mt-3 rounded-lg bg-slate-100 p-3 text-sm text-slate-600">
              You have read-only access. Owners, admins and designers can edit the brand kit.
            </p>
          )}
          {error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {notice && (
            <p className="mt-3 rounded-lg bg-green-50 p-3 text-sm text-green-800">{notice}</p>
          )}
        </section>

        <section className="card space-y-4 p-6">
          <h2 className="font-bold">Colors</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {(
              [
                ['primaryColor', 'Primary'],
                ['secondaryColor', 'Secondary'],
                ['accentColor', 'Accent'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block text-sm">
                <span className="font-semibold">{label}</span>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="color"
                    disabled={dis}
                    value={form[key]}
                    onChange={(e) => set(key, e.target.value.toUpperCase())}
                    className="h-9 w-12 cursor-pointer rounded border border-slate-300 bg-white p-0.5"
                  />
                  <input
                    className="input"
                    disabled={dis}
                    value={form[key]}
                    maxLength={7}
                    pattern="^#[0-9a-fA-F]{6}$"
                    onChange={(e) => set(key, e.target.value)}
                  />
                </div>
              </label>
            ))}
          </div>
        </section>

        <section className="card space-y-4 p-6">
          <h2 className="font-bold">Typography & style</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ['headingFont', 'Heading font'],
                ['bodyFont', 'Body font'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block text-sm">
                <span className="font-semibold">{label}</span>
                <input
                  className="input mt-1"
                  list="fonts"
                  disabled={dis}
                  value={form[key]}
                  onChange={(e) => set(key, e.target.value)}
                />
              </label>
            ))}
            <datalist id="fonts">
              {FONTS.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          </div>
          <label className="block text-sm">
            <span className="font-semibold">Preferred image style</span>
            <input
              className="input mt-1"
              disabled={dis}
              maxLength={300}
              placeholder="e.g. bright, natural light, real students, minimal"
              value={form.imageStyle}
              onChange={(e) => set('imageStyle', e.target.value)}
            />
          </label>
        </section>

        <section className="card space-y-4 p-6">
          <h2 className="font-bold">Logos</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ['mainLogoId', 'Main logo'],
                ['altLogoId', 'Alternative logo'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block text-sm">
                <span className="font-semibold">{label}</span>
                <select
                  className="input mt-1"
                  disabled={dis}
                  value={form[key]}
                  onChange={(e) => set(key, e.target.value)}
                >
                  <option value="">None</option>
                  {media.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.filename}
                    </option>
                  ))}
                </select>
                {form[key] && (
                  <AuthImage
                    orgId={currentOrgId!}
                    assetId={form[key]}
                    alt={label}
                    className="mt-2 h-20 w-full rounded-lg border border-slate-200 bg-slate-50 object-contain"
                  />
                )}
              </label>
            ))}
          </div>
          {media.length === 0 && (
            <p className="text-xs text-slate-500">
              Upload images in the Media library first, then pick them here.
            </p>
          )}
        </section>

        <section className="card space-y-4 p-6">
          <h2 className="font-bold">Organization details</h2>
          <label className="block text-sm">
            <span className="font-semibold">Description</span>
            <textarea
              className="input mt-1"
              rows={3}
              disabled={dis}
              maxLength={1000}
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-semibold">Website</span>
              <input
                className="input mt-1"
                type="url"
                disabled={dis}
                placeholder="https://"
                value={form.websiteUrl}
                onChange={(e) => set('websiteUrl', e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="font-semibold">Default language</span>
              <select
                className="input mt-1"
                disabled={dis}
                value={form.defaultLanguage}
                onChange={(e) => set('defaultLanguage', e.target.value)}
              >
                <option value="en">English</option>
                <option value="fr">Français</option>
                <option value="ar">العربية</option>
              </select>
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {SOCIALS.map((s) => (
              <label key={s} className="block text-sm">
                <span className="font-semibold capitalize">{s === 'x' ? 'X (Twitter)' : s}</span>
                <input
                  className="input mt-1"
                  type="url"
                  disabled={dis}
                  placeholder="https://"
                  value={form.socialUrls[s] ?? ''}
                  onChange={(e) => set('socialUrls', { ...form.socialUrls, [s]: e.target.value })}
                />
              </label>
            ))}
          </div>
        </section>

        {canWrite && (
          <section className="card flex flex-wrap items-center gap-3 p-4">
            <input
              className="input !w-64"
              maxLength={100}
              placeholder="Version label (optional)"
              value={form.label}
              onChange={(e) => set('label', e.target.value)}
            />
            <button className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save as new version'}
            </button>
          </section>
        )}
      </form>

      <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <section className="card overflow-hidden">
          <div className="p-4 text-white" style={{ background: form.primaryColor }}>
            <div className="flex items-center gap-3">
              {logoId ? (
                <AuthImage
                  orgId={currentOrgId!}
                  assetId={logoId}
                  alt="Logo"
                  className="h-10 w-10 rounded-lg bg-white/90 object-contain p-1"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20 font-bold">
                  {orgName[0]}
                </div>
              )}
              <p
                className="text-lg font-bold"
                style={{ fontFamily: `"${form.headingFont}", system-ui, sans-serif` }}
              >
                {orgName}
              </p>
            </div>
          </div>
          <div
            className="space-y-3 p-4"
            style={{ fontFamily: `"${form.bodyFont}", system-ui, sans-serif` }}
          >
            <p
              className="text-lg font-bold"
              style={{
                color: form.secondaryColor,
                fontFamily: `"${form.headingFont}", system-ui, sans-serif`,
              }}
            >
              Open day: meet our teachers
            </p>
            <p className="text-sm text-slate-600">
              {form.description || 'Your description appears here in the body font.'}
            </p>
            <span
              className="inline-block rounded-full px-4 py-1.5 text-sm font-semibold text-white"
              style={{ background: form.accentColor }}
            >
              Register now
            </span>
          </div>
          <p className="border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400">
            Live preview
          </p>
        </section>

        <section className="card p-4">
          <h2 className="mb-2 text-sm font-bold">Versions</h2>
          {versions.length === 0 ? (
            <p className="text-sm text-slate-500">None yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {versions.map((k) => (
                <li key={k.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      v{k.version}{' '}
                      {k.isActive && (
                        <span className="ml-1 rounded-full bg-green-100 px-2 text-[11px] text-green-800">
                          Active
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-slate-400">
                      {k.label || new Date(k.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {[k.primaryColor, k.secondaryColor, k.accentColor].map((c, i) => (
                      <span
                        key={i}
                        className="h-4 w-4 rounded-full border border-slate-200"
                        style={{ background: c }}
                      />
                    ))}
                    {canWrite && !k.isActive && (
                      <button
                        type="button"
                        className="btn-ghost !px-2 !py-1 text-xs"
                        onClick={() => activate(k.id)}
                      >
                        Use
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}
