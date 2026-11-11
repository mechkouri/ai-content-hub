'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useApp } from './app-context';

/** Redirects to /login (keeping the destination) when signed out. Returns true when ready. */
export function useRequireAuth(): boolean {
  const { loading, user } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (!loading && !user) {
      const search = typeof window !== 'undefined' ? window.location.search : '';
      router.replace(`/login?next=${encodeURIComponent(pathname + search)}`);
    }
  }, [loading, user, router, pathname]);
  return !loading && !!user;
}
