'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect } from 'react';
import { Logo } from '@/components/auth-card';
import { useApp } from '@/lib/app-context';
import { useRequireAuth } from '@/lib/use-require-auth';

const NAV = [
  { href: '/dashboard', label: 'Overview', icon: '🏠' },
  { href: '/sources', label: 'Sources', icon: '📄' },
  { href: '/studio', label: 'Content studio', icon: '✍️' },
  { href: '/brand', label: 'Brand kit', icon: '🎨' },
  { href: '/media', label: 'Media library', icon: '🖼️' },
  { href: '/ai', label: 'AI providers', icon: '✨' },
  { href: '/members', label: 'Team', icon: '👥' },
];
const SOON = ['Campaigns', 'Design Studio', 'Calendar', 'Integrations'];

export default function AppShell({ children }: { children: ReactNode }) {
  const ready = useRequireAuth();
  const { user, memberships, currentOrgId, setCurrentOrg, signOut, loading } = useApp();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (ready && memberships.length === 0) router.replace('/onboarding');
  }, [ready, memberships.length, router]);

  if (loading || !ready || memberships.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">Loading…</div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between bg-white px-4 shadow-card">
        <Logo />
        <div className="flex items-center gap-3">
          <select
            aria-label="Organization"
            className="input !w-auto"
            value={currentOrgId ?? ''}
            onChange={(e) => setCurrentOrg(e.target.value)}
          >
            {memberships.map((m) => (
              <option key={m.organizationId} value={m.organizationId}>
                {m.organization.name}
              </option>
            ))}
          </select>
          <Link href="/onboarding" className="btn-ghost hidden sm:inline-flex">
            + New organization
          </Link>
          <span className="hidden text-sm text-slate-500 md:inline">{user?.email}</span>
          <button
            className="btn-ghost"
            onClick={async () => {
              await signOut();
              router.replace('/login');
            }}
          >
            Log out
          </button>
        </div>
      </header>
      <div className="mx-auto flex max-w-6xl gap-4 p-4">
        <nav className="hidden w-56 shrink-0 md:block">
          <ul className="space-y-1">
            {NAV.map((n) => (
              <li key={n.href}>
                <Link
                  href={n.href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold ${
                    pathname === n.href ? 'bg-brand-soft text-brand' : 'hover:bg-slate-200/70'
                  }`}
                >
                  <span>{n.icon}</span>
                  {n.label}
                </Link>
              </li>
            ))}
            {SOON.map((label) => (
              <li
                key={label}
                aria-disabled="true"
                className="flex cursor-not-allowed items-center justify-between rounded-lg px-3 py-2 text-sm text-slate-400"
              >
                {label}
                <span className="rounded bg-slate-200 px-1.5 text-[10px] uppercase">Soon</span>
              </li>
            ))}
          </ul>
        </nav>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
