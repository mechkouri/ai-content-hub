'use client';

import { Lock } from 'lucide-react';
import Link from 'next/link';
import { useT } from '@/lib/i18n';

/** Shown instead of a page that needs an account. Visitors can look around; creating or using features needs a login. */
export function AuthGate({ feature, next }: { feature: string; next: string }) {
  const t = useT();
  const q = `?next=${encodeURIComponent(next)}`;
  return (
    <div className="card mx-auto mt-10 max-w-lg p-8 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft text-brand">
        <Lock size={22} aria-hidden />
      </span>
      <h1 className="mt-4 font-display text-xl font-semibold">{t('gate.title', { feature })}</h1>
      <p className="mt-1 text-sm text-muted">{t('gate.body')}</p>
      <div className="mt-6 flex justify-center gap-3">
        <Link href={`/login${q}`} className="btn-primary">
          {t('topbar.login')}
        </Link>
        <Link href="/signup" className="btn-ghost">
          {t('topbar.signup')}
        </Link>
      </div>
    </div>
  );
}
