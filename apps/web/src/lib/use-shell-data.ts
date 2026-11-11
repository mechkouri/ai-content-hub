'use client';

import { useEffect, useState } from 'react';
import { AiStatus, apiFetch, BrandKit } from './api';

export interface ShellData {
  brandName: string | null;
  credits: { used: number; limit: number } | null;
}

/** Small facts the sidebar shows. Every failure is silent: the shell must never break because a widget could not load. */
export function useShellData(orgId: string | null): ShellData {
  const [data, setData] = useState<ShellData>({ brandName: null, credits: null });

  useEffect(() => {
    if (!orgId) return;
    let live = true;
    setData({ brandName: null, credits: null });
    apiFetch<BrandKit>(`/organizations/${orgId}/brand-kits/active`)
      .then(
        (k) => live && setData((d) => ({ ...d, brandName: k.label || `Brand kit v${k.version}` })),
      )
      .catch(() => undefined);
    apiFetch<AiStatus>(`/organizations/${orgId}/ai/status`)
      .then(
        (s) =>
          live &&
          setData((d) => ({
            ...d,
            credits: { used: s.usage.text.today, limit: s.limits.dailyText },
          })),
      )
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [orgId]);

  return data;
}
