'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { AuthCard } from '@/components/auth-card';
import { apiFetch } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { useI18n } from '@/lib/i18n';
import { useRequireAuth } from '@/lib/use-require-auth';

function Accept() {
  const ready = useRequireAuth();
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const { refresh, setCurrentOrg } = useApp();
  const { t } = useI18n();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!ready)
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        {t('common.loading')}
      </div>
    );

  async function accept() {
    setBusy(true);
    setError('');
    try {
      const m = await apiFetch<{ organizationId: string }>('/invitations/accept', {
        method: 'POST',
        body: JSON.stringify({ token }),
      });
      await refresh();
      setCurrentOrg(m.organizationId);
      router.replace('/dashboard');
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <AuthCard title={t('inv.title')} subtitle={t('inv.subtitle')}>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      <button className="btn-primary w-full" disabled={busy || !token} onClick={accept}>
        {busy ? t('inv.joining') : t('inv.accept')}
      </button>
    </AuthCard>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense>
      <Accept />
    </Suspense>
  );
}
