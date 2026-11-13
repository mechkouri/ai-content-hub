'use client';

import { FileText, PenLine, ShieldCheck, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useT } from '@/lib/i18n';

const STEPS = [
  { icon: FileText, title: 'guest.step1.title', text: 'guest.step1.text' },
  { icon: ShieldCheck, title: 'guest.step2.title', text: 'guest.step2.text' },
  { icon: PenLine, title: 'guest.step3.title', text: 'guest.step3.text' },
] as const;

/** What visitors see on the dashboard before logging in. */
export function GuestHome() {
  const t = useT();
  return (
    <div className="space-y-6">
      <section className="card relative overflow-hidden p-8 lg:p-10">
        <p className="eyebrow">{t('guest.welcome')}</p>
        <h1 className="mt-1 max-w-2xl font-display text-3xl font-semibold leading-tight">
          {t('guest.headline')}
        </h1>
        <p className="mt-3 max-w-xl text-sm text-muted">{t('guest.body')}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/signup" className="btn-primary">
            <Sparkles size={16} aria-hidden /> {t('guest.cta')}
          </Link>
          <Link href="/login" className="btn-ghost">
            {t('topbar.login')}
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3" aria-label={t('guest.how')}>
        {STEPS.map(({ icon: Icon, title, text }) => (
          <div key={title} className="card p-5">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-soft text-brand">
              <Icon size={20} aria-hidden />
            </span>
            <h2 className="mt-3 font-display text-base font-semibold">{t(title)}</h2>
            <p className="mt-1 text-sm text-muted">{t(text)}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
