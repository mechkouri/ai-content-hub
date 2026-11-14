'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch, Channel, ContentKind, CONTENT_KINDS, canManageChannels } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { describeError } from '@/lib/errors';
import { useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/lib/i18n/messages';
import { translateAutomationResult } from '@/lib/i18n/server-messages';

interface Rule {
  id: string;
  name: string;
  enabled: boolean;
  kinds: ContentKind[];
  mode: 'now' | 'slot';
  slot: string | null;
  timezone: string;
  channelIds: string[];
  lastRunAt: string | null;
  lastResult: string | null;
}

interface Form {
  id: string | null;
  name: string;
  enabled: boolean;
  kinds: ContentKind[];
  mode: 'now' | 'slot';
  slot: string;
  timezone: string;
  channelIds: string[];
}

const KIND_IDS = CONTENT_KINDS.map((k) => k.id);

function zones(extra: string): string[] {
  let list: string[] = [];
  try {
    list = (Intl as any).supportedValuesOf?.('timeZone') ?? [];
  } catch {
    list = [];
  }
  if (list.length === 0)
    list = ['UTC', 'Africa/Casablanca', 'Europe/Paris', 'Europe/London', 'America/New_York'];
  return list.includes(extra) ? list : [extra, ...list];
}

const browserZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

export default function AutomationPage() {
  const { currentOrgId, currentRole } = useApp();
  const { t, dateLocale, locale } = useI18n();
  const canManage = canManageChannels(currentRole);
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const base = `/organizations/${currentOrgId}`;

  const load = useCallback(async () => {
    if (!currentOrgId) return;
    try {
      setRules(await apiFetch<Rule[]>(`${base}/automation-rules`));
      setChannels(await apiFetch<Channel[]>(`${base}/channels`));
    } catch (e) {
      setError(describeError(e));
    }
  }, [currentOrgId, base]);

  useEffect(() => {
    setRules(null);
    load();
  }, [load]);

  const channelName = (id: string) =>
    channels.find((c) => c.id === id)?.name ?? t('au.removedChannel');
  const allZones = useMemo(() => zones(form?.timezone ?? browserZone()), [form?.timezone]);

  const blank = (): Form => ({
    id: null,
    name: '',
    enabled: true,
    kinds: [],
    mode: 'slot',
    slot: '09:00',
    timezone: browserZone(),
    channelIds: [],
  });

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    setError('');
    try {
      const body = {
        name: form.name.trim(),
        enabled: form.enabled,
        kinds: form.kinds,
        mode: form.mode,
        slot: form.mode === 'slot' ? form.slot : null,
        timezone: form.timezone,
        channelIds: form.channelIds,
      };
      await apiFetch(form.id ? `${base}/automation-rules/${form.id}` : `${base}/automation-rules`, {
        method: form.id ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });
      setForm(null);
      await load();
    } catch (err) {
      setError(describeError(err));
    }
    setBusy(false);
  }

  async function toggle(rule: Rule) {
    setError('');
    try {
      await apiFetch(`${base}/automation-rules/${rule.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: !rule.enabled }),
      });
      await load();
    } catch (err) {
      setError(describeError(err));
    }
  }

  async function remove(rule: Rule) {
    if (!confirm(t('au.confirmDelete', { name: rule.name }))) return;
    setError('');
    try {
      await apiFetch(`${base}/automation-rules/${rule.id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(describeError(err));
    }
  }

  const summary = (r: Rule) => {
    const kinds = r.kinds.length
      ? r.kinds.map((k) => t(`kind.${k}` as MessageKey)).join(', ')
      : t('au.allKinds');
    const where = r.channelIds.map(channelName).join(', ');
    const when =
      r.mode === 'now'
        ? t('au.whenNow')
        : t('au.whenSlot', { time: r.slot ?? '', zone: r.timezone });
    return t('au.summary', { kinds, where, when });
  };

  const toggleIn = <T,>(list: T[], v: T) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  const ready =
    !!form &&
    form.name.trim().length >= 2 &&
    form.channelIds.length > 0 &&
    (form.mode === 'now' || !!form.slot);

  return (
    <div className="space-y-4">
      <section className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-[28px] font-semibold leading-tight">
              {t('nav.workflow')}
            </h1>
            <p className="text-sm text-muted">{t('au.subtitle')}</p>
          </div>
          {canManage && !form && (
            <button className="btn-primary" onClick={() => setForm(blank())}>
              + {t('au.new')}
            </button>
          )}
        </div>
        <ul className="mt-3 space-y-1 text-xs text-muted">
          <li>• {t('au.rule1')}</li>
          <li>• {t('au.rule2')}</li>
          <li>• {t('au.rule3')}</li>
        </ul>
        {!canManage && (
          <p className="mt-3 rounded-lg bg-slate-100 p-3 text-sm text-slate-600">
            {t('au.readOnly')}
          </p>
        )}
        {error && (
          <p className="mt-3 rounded-lg border border-red-200 bg-danger-soft p-3 text-sm text-danger-ink">
            {error}
          </p>
        )}
      </section>

      {form && (
        <form onSubmit={save} className="card space-y-4 p-6">
          <h2 className="font-display text-base font-semibold">
            {form.id ? t('au.edit') : t('au.new')}
          </h2>
          <label className="block text-sm">
            <span className="font-semibold">{t('au.name')}</span>
            <input
              className="input mt-1"
              maxLength={80}
              required
              placeholder={t('au.namePh')}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>

          <fieldset className="space-y-1.5">
            <legend className="text-sm font-semibold">{t('au.kinds')}</legend>
            <p className="text-xs text-muted">{t('au.kindsHint')}</p>
            <div className="flex flex-wrap gap-3">
              {KIND_IDS.map((k) => (
                <label key={k} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.kinds.includes(k)}
                    onChange={() => setForm({ ...form, kinds: toggleIn(form.kinds, k) })}
                  />
                  {t(`kind.${k}` as MessageKey)}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-1.5">
            <legend className="text-sm font-semibold">{t('au.channels')}</legend>
            {channels.length === 0 ? (
              <p className="text-sm text-muted">{t('au.noChannels')}</p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {channels.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.channelIds.includes(c.id)}
                      onChange={() =>
                        setForm({ ...form, channelIds: toggleIn(form.channelIds, c.id) })
                      }
                    />
                    {c.name}
                    <span className="text-xs text-muted">
                      · {t(`provider.${c.provider}` as MessageKey)}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">{t('au.timing')}</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="mode"
                checked={form.mode === 'now'}
                onChange={() => setForm({ ...form, mode: 'now' })}
              />
              {t('au.modeNow')}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="mode"
                checked={form.mode === 'slot'}
                onChange={() => setForm({ ...form, mode: 'slot' })}
              />
              {t('au.modeSlot')}
            </label>
            {form.mode === 'slot' && (
              <div className="flex flex-wrap items-center gap-2 ps-6">
                <input
                  type="time"
                  className="input !w-auto"
                  aria-label={t('au.time')}
                  required
                  value={form.slot}
                  onChange={(e) => setForm({ ...form, slot: e.target.value })}
                />
                <select
                  className="input !w-auto max-w-[16rem]"
                  aria-label={t('au.zone')}
                  value={form.timezone}
                  onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                >
                  {allZones.map((z) => (
                    <option key={z} value={z}>
                      {z}
                    </option>
                  ))}
                </select>
                <p className="w-full text-xs text-muted">{t('au.slotHint')}</p>
              </div>
            )}
          </fieldset>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            />
            {t('au.enabled')}
          </label>

          <div className="flex gap-2">
            <button className="btn-primary" disabled={busy || !ready}>
              {busy ? t('det.saving') : t('common.save')}
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setForm(null)}
              disabled={busy}
            >
              {t('common.cancel')}
            </button>
          </div>
        </form>
      )}

      <section className="card p-6">
        <h2 className="font-display text-base font-semibold">{t('au.rules')}</h2>
        {rules === null ? (
          <p className="mt-2 text-sm text-muted">{t('common.loading')}</p>
        ) : rules.length === 0 ? (
          <div className="mt-3 rounded-xl bg-surface p-4 text-sm text-muted">
            <p className="font-semibold text-slate-700">{t('au.none')}</p>
            <p>{t('au.noneHint')}</p>
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {rules.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-4">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    {r.name}
                    <span className={r.enabled ? 'chip-ok' : 'chip-draft'}>
                      {r.enabled ? t('au.on') : t('au.off')}
                    </span>
                  </p>
                  <p className="mt-0.5 text-sm text-slate-600">{summary(r)}</p>
                  <p className="mt-1 text-xs text-muted">
                    {r.lastRunAt
                      ? t('au.lastRun', {
                          date: new Date(r.lastRunAt).toLocaleString(dateLocale),
                          result: translateAutomationResult(locale, r.lastResult ?? ''),
                        })
                      : t('au.neverRun')}
                  </p>
                </div>
                {canManage && (
                  <div className="flex flex-wrap gap-2">
                    <button className="btn-ghost btn-sm" onClick={() => toggle(r)}>
                      {r.enabled ? t('au.turnOff') : t('au.turnOn')}
                    </button>
                    <button
                      className="btn-ghost btn-sm"
                      onClick={() =>
                        setForm({
                          id: r.id,
                          name: r.name,
                          enabled: r.enabled,
                          kinds: r.kinds,
                          mode: r.mode,
                          slot: r.slot ?? '09:00',
                          timezone: r.timezone,
                          channelIds: r.channelIds,
                        })
                      }
                    >
                      {t('common.edit')}
                    </button>
                    <button className="btn-danger btn-sm" onClick={() => remove(r)}>
                      {t('common.delete')}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
