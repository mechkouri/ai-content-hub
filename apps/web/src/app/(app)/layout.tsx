'use client';

import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { Sidebar } from '@/components/shell/sidebar';
import { Topbar } from '@/components/shell/topbar';
import { useApp } from '@/lib/app-context';
import { useRequireAuth } from '@/lib/use-require-auth';
import { useShellData } from '@/lib/use-shell-data';

export default function AppShell({ children }: { children: ReactNode }) {
  const ready = useRequireAuth();
  const { user, memberships, currentOrgId, setCurrentOrg, signOut, loading } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const shell = useShellData(currentOrgId);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (ready && memberships.length === 0) router.replace('/onboarding');
  }, [ready, memberships.length, router]);

  // Close the mobile menu after navigating.
  useEffect(() => setMenuOpen(false), [pathname]);

  if (loading || !ready || memberships.length === 0) {
    return <div className="flex min-h-screen items-center justify-center text-muted">Loading…</div>;
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
      <div className="lg:pl-rail">
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
        <main className="mx-auto w-full max-w-[1280px] px-4 py-6 lg:px-10 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
