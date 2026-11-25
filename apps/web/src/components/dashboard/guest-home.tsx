'use client';

import { Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useT } from '@/lib/i18n';

/** The welcome banner above the dashboard for visitors who have not logged in. */
export function GuestHome() {
  const t = useT();
  return (
    <div className="space-y-6">
      <section className="card relative overflow-hidden p-5 lg:p-6">
        <p className="eyebrow">{t('guest.welcome')}</p>
        <h1 className="mt-1 max-w-2xl font-display text-2xl font-semibold leading-tight">
          {t('guest.headline')}
        </h1>
        <p className="mt-3 max-w-xl text-sm text-muted">{t('guest.body')}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/signup" className="btn-primary">
            <Sparkles size={16} aria-hidden /> {t('guest.cta')}
          </Link>
          <Link href="/login" className="btn-ghost">
            {t('topbar.login')}
          </Link>
        </div>
      </section>
    </div>
  );
}
