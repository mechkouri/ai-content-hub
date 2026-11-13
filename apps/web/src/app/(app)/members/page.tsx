'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { apiFetch, MemberRow, Role, ROLES } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { describeError } from '@/lib/errors';
import { useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/lib/i18n/messages';

export default function MembersPage() {
  const { currentOrgId, currentRole, user } = useApp();
  const { t } = useI18n();
  const roleName = (r: Role) => t(`role.${r}` as MessageKey);
  const canManage = currentRole === 'OWNER' || currentRole === 'ADMIN';
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('EDITOR');
  const [inviteLink, setInviteLink] = useState('');

  const load = useCallback(async () => {
    if (!currentOrgId) return;
    try {
      setMembers(await apiFetch<MemberRow[]>(`/organizations/${currentOrgId}/members`));
    } catch (e) {
      setError(describeError(e));
    }
  }, [currentOrgId]);

  useEffect(() => {
    load();
  }, [load]);

  const assignable = ROLES.filter((r) => currentRole === 'OWNER' || r !== 'OWNER');

  async function invite(e: FormEvent) {
    e.preventDefault();
    setError('');
    setInviteLink('');
    try {
      const res = await apiFetch<{ token: string }>(`/organizations/${currentOrgId}/invitations`, {
        method: 'POST',
        body: JSON.stringify({ email, role }),
      });
      setInviteLink(`${window.location.origin}/accept-invite?token=${res.token}`);
      setEmail('');
    } catch (e) {
      setError(describeError(e));
    }
  }

  async function changeRole(userId: string, newRole: Role) {
    setError('');
    try {
      await apiFetch(`/organizations/${currentOrgId}/members/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role: newRole }),
      });
      await load();
    } catch (e) {
      setError(describeError(e));
    }
  }

  async function remove(userId: string) {
    if (!confirm(t('mem.confirmRemove'))) return;
    setError('');
    try {
      await apiFetch(`/organizations/${currentOrgId}/members/${userId}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(describeError(e));
    }
  }

  return (
    <div className="space-y-4">
      <section className="card p-6">
        <h1 className="mb-4 text-xl font-bold">{t('mem.title')}</h1>
        {error && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <ul className="divide-y divide-slate-100">
          {members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div>
                <p className="text-sm font-semibold">{m.user.email}</p>
                {m.userId === user?.id && <p className="text-xs text-slate-400">{t('mem.you')}</p>}
              </div>
              <div className="flex items-center gap-2">
                {canManage && m.userId !== user?.id ? (
                  <>
                    <select
                      className="input !w-auto"
                      value={m.role}
                      onChange={(e) => changeRole(m.userId, e.target.value as Role)}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r} disabled={!assignable.includes(r)}>
                          {roleName(r)}
                        </option>
                      ))}
                    </select>
                    <button className="btn-danger" onClick={() => remove(m.userId)}>
                      {t('common.remove')}
                    </button>
                  </>
                ) : (
                  <span className="rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand">
                    {roleName(m.role)}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {canManage && (
        <section className="card p-6">
          <h2 className="mb-3 font-bold">{t('mem.invite')}</h2>
          <form onSubmit={invite} className="flex flex-wrap gap-2">
            <input
              className="input !w-64"
              type="email"
              required
              placeholder={t('mem.emailPh')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <select
              className="input !w-auto"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              {assignable.map((r) => (
                <option key={r} value={r}>
                  {roleName(r)}
                </option>
              ))}
            </select>
            <button className="btn-primary">{t('mem.create')}</button>
          </form>
          {inviteLink && (
            <div className="mt-3 rounded-lg bg-green-50 p-3 text-sm text-green-900">
              <p className="mb-1 font-semibold">{t('mem.sendLink')}</p>
              <code className="break-all">{inviteLink}</code>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
