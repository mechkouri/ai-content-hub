'use client';

import { useEffect, useState } from 'react';
import { Overview, OverviewData, nameFromEmail } from '@/components/dashboard/overview';
import { AiStatus, apiFetch, BrandKit, ContentSummary, SourceSummary } from '@/lib/api';
import { useApp } from '@/lib/app-context';

export default function Dashboard() {
  const { currentOrgId, memberships, user } = useApp();
  const orgName =
    memberships.find((m) => m.organizationId === currentOrgId)?.organization.name ?? '';
  const [data, setData] = useState<OverviewData | null>(null);

  useEffect(() => {
    if (!currentOrgId) return;
    let live = true;
    setData(null);
    const base = `/organizations/${currentOrgId}`;
    // Each widget loads independently: a role without AI access must not blank the whole page.
    Promise.allSettled([
      apiFetch<SourceSummary[]>(`${base}/sources`),
      apiFetch<ContentSummary[]>(`${base}/content`),
      apiFetch<AiStatus>(`${base}/ai/status`),
      apiFetch<BrandKit>(`${base}/brand-kits/active`),
    ]).then(([sources, content, ai, brand]) => {
      if (!live) return;
      setData({
        sources: sources.status === 'fulfilled' ? sources.value : [],
        content: content.status === 'fulfilled' ? content.value : [],
        ai: ai.status === 'fulfilled' ? ai.value : null,
        hasBrandKit: brand.status === 'fulfilled',
      });
    });
    return () => {
      live = false;
    };
  }, [currentOrgId]);

  if (!data) return <p className="text-sm text-muted">Loading…</p>;
  return <Overview data={data} name={nameFromEmail(user?.email ?? '')} orgName={orgName} />;
}
