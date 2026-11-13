'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { AuthCard } from '@/components/auth-card';
import { apiFetch, Organization } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { describeError } from '@/lib/errors';
import { useT } from '@/lib/i18n';
import { useRequireAuth } from '@/lib/use-require-auth';

export default function Onboarding() {
  const ready = useRequireAuth();
  const router = useRouter();
  const t = useT();
  const { refresh, setCurrentOrg, memberships } = useApp();
  const [name, setName] = useState('');
  const [language, setLanguage] = useState('en');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!ready)
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        {t('common.loading')}
      </div>
    );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const org = await apiFetch<Organization>('/organizations', {
        method: 'POST',
        body: JSON.stringify({ name, defaultLanguage: language }),
      });
      await refresh();
      setCurrentOrg(org.id);
      router.replace('/dashboard');
    } catch (e) {
      setError(describeError(e));
      setBusy(false);
    }
  }

  return (
    <AuthCard title={t('onboarding.title')} subtitle={t('onboarding.subtitle')}>
      <form onSubmit={onSubmit} className="space-y-3">
        <input
          className="input"
          required
          minLength={2}
          placeholder={t('onboarding.name')}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select className="input" value={language} onChange={(e) => setLanguage(e.target.value)}>
          <option value="en">English</option>
          <option value="fr">Français</option>
          <option value="ar">العربية</option>
        </select>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? t('auth.creating') : t('onboarding.create')}
        </button>
        {memberships.length > 0 && (
          <button type="button" className="btn-ghost w-full" onClick={() => router.back()}>
            {t('common.cancel')}
          </button>
        )}
      </form>
    </AuthCard>
  );
}
