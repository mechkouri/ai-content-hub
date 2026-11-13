'use client';

import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { Sidebar } from '@/components/shell/sidebar';
import { AuthGate } from '@/components/auth-gate';
import { GuestTopbar, Topbar } from '@/components/shell/topbar';
import { useApp } from '@/lib/app-context';
import { useT } from '@/lib/i18n';
import type { MessageKey } from '@/lib/i18n/messages';
import { useShellData } from '@/lib/use-shell-data';

const FEATURES: [string, MessageKey][] = [
  ['/sources', 'gate.sources'],
  ['/studio', 'gate.studio'],
  ['/calendar', 'gate.calendar'],
  ['/campaigns', 'gate.campaigns'],
  ['/channels', 'gate.channels'],
  ['/analytics', 'gate.analytics'],
  ['/brand', 'gate.brand'],
  ['/media', 'gate.media'],
  ['/ai', 'gate.ai'],
  ['/members', 'gate.members'],
];
const featureKey = (path: string): MessageKey =>
  FEATURES.find(([p]) => path === p || path.startsWith(`${p}/`))?.[1] ?? 'gate.page';

export default function AppShell({ children }: { children: ReactNode }) {
  const { user, memberships, currentOrgId, setCurrentOrg, signOut, loading } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const t = useT();
  const shell = useShellData(currentOrgId);
  const [menuOpen, setMenuOpen] = useState(false);

  // Visitors can browse; only a signed-in user without any organization is sent to create one.
  useEffect(() => {
    if (!loading && user && memberships.length === 0) router.replace('/onboarding');
  }, [loading, user, memberships.length, router]);

  // Close the mobile menu after navigating.
  useEffect(() => setMenuOpen(false), [pathname]);

  const guest = !loading && !user;
  if (loading || (user && memberships.length === 0)) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted">
        {t('common.loading')}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      <Sidebar
        pathname={pathname}
        brandName={shell.brandName}
        credits={shell.credits}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
      />
      <div className="lg:ps-rail">
        {guest ? (
          <GuestTopbar onMenu={() => setMenuOpen(true)} />
        ) : (
          <Topbar
            orgs={memberships.map((m) => ({ id: m.organizationId, name: m.organization.name }))}
            currentOrgId={currentOrgId}
            onOrgChange={setCurrentOrg}
            userEmail={user?.email ?? ''}
            onSignOut={async () => {
              await signOut();
              router.replace('/login');
            }}
            onMenu={() => setMenuOpen(true)}
          />
        )}
        <main className="mx-auto w-full max-w-[1280px] px-4 py-6 lg:px-10 lg:py-8">
          {guest && pathname !== '/dashboard' ? (
            <AuthGate feature={t(featureKey(pathname))} next={pathname} />
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
