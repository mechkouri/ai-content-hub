'use client';

import { useApp } from '@/lib/app-context';

export default function Dashboard() {
  const { memberships, currentOrgId, currentRole } = useApp();
  const org = memberships.find((m) => m.organizationId === currentOrgId)?.organization;

  return (
    <div className="space-y-4">
      <section className="card p-6">
        <h1 className="text-2xl font-bold">{org?.name}</h1>
        <p className="mt-1 text-sm text-slate-500">
          Your role: <span className="font-semibold text-slate-700">{currentRole}</span> · Default
          language:{' '}
          <span className="font-semibold text-slate-700">{org?.defaultLanguage.toUpperCase()}</span>
        </p>
      </section>
      <section className="card p-6">
        <h2 className="font-bold">Getting started</h2>
        <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-slate-600">
          <li>Invite your team from the Team page.</li>
          <li>Brand kit, content creation and campaigns arrive in the next features.</li>
        </ul>
      </section>
    </div>
  );
}
