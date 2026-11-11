import { ReactNode } from 'react';
import { isSupabaseConfigured } from '@/lib/supabase';
import { Logo } from './shell/logo';

export { Logo };

export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,#EFF6FF,transparent_60%)] p-4">
      <div className="w-full max-w-md">
        <Logo className="mb-8 justify-center" />
        <div className="card p-7 shadow-lift">
          <h1 className="font-display text-2xl font-semibold">{title}</h1>
          <p className="mb-6 mt-1 text-sm text-muted">{subtitle}</p>
          {!isSupabaseConfigured && (
            <p className="mb-4 rounded-lg border border-amber-200 bg-warn-soft p-3 text-sm text-warn-ink">
              Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and
              NEXT_PUBLIC_SUPABASE_ANON_KEY in apps/web/.env.local.
            </p>
          )}
          {children}
        </div>
        <p className="mt-6 text-center text-xs text-muted">
          One input, a complete digital campaign.
        </p>
      </div>
    </main>
  );
}
