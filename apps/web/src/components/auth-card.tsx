import type { ReactNode } from 'react';
import { isSupabaseConfigured } from '@/lib/supabase';

export function Logo({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-brand via-fuchsia-500 to-orange-400 text-lg font-bold text-white">
        A
      </div>
      <span className="text-lg font-bold tracking-tight">AI Content Hub</span>
    </div>
  );
}

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
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Logo className="mb-6 justify-center" />
        <div className="card p-6">
          <h1 className="text-xl font-bold">{title}</h1>
          <p className="mb-5 mt-1 text-sm text-slate-500">{subtitle}</p>
          {!isSupabaseConfigured && (
            <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and
              NEXT_PUBLIC_SUPABASE_ANON_KEY in apps/web/.env.local.
            </p>
          )}
          {children}
        </div>
      </div>
    </main>
  );
}
