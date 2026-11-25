'use client';

import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { Sidebar } from '@/components/shell/sidebar';
import { GuestTopbar, Topbar } from '@/components/shell/topbar';
import { useApp } from '@/lib/app-context';
import { useT } from '@/lib/i18n';
import { useShellData } from '@/lib/use-shell-data';

export default function AppShell({ children }: { children: ReactNode }) {
  const {
    user,
    memberships,
    membershipsStatus,
    currentOrgId,
    setCurrentOrg,
    signOut,
    refresh,
    loading,
  } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const t = useT();
  const shell = useShellData(currentOrgId);
  const [menuOpen, setMenuOpen] = useState(false);

  // Visitors can browse. A signed-in user is sent to create an organization only once we KNOW they have none
  // (the list was fetched and is empty), never because the list is still loading or failed to load.
  const noOrganization = membershipsStatus === 'ready' && memberships.length === 0;
  useEffect(() => {
    if (!loading && user && noOrganization) router.replace('/onboarding');
  }, [loading, user, noOrganization, router]);

  // Close the mobile menu after navigating.
  useEffect(() => setMenuOpen(false), [pathname]);

  const guest = !loading && !user;
  // Visitors see the dashboard freely. Opening anything that uses the platform takes them to log in,
  // and they come back to that page afterwards.
  const needsLogin = guest && pathname !== '/dashboard';
  useEffect(() => {
    if (needsLogin) {
      router.replace(`/login?next=${encodeURIComponent(pathname + window.location.search)}`);
    }
  }, [needsLogin, pathname, router]);
  if (user && !loading && membershipsStatus === 'error' && memberships.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="max-w-sm text-sm text-muted">{t('app.loadFailed')}</p>
        <button className="btn-primary" onClick={() => void refresh()}>
          {t('ch.tryAgain')}
        </button>
      </div>
    );
  }
  if (loading || needsLogin || (user && memberships.length === 0)) {
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
              router.replace('/dashboard');
            }}
            onMenu={() => setMenuOpen(true)}
          />
        )}
        <main className="mx-auto w-full max-w-[1280px] px-4 py-6 lg:px-10 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
