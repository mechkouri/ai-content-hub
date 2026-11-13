'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { AiStatus, ApiError, apiFetch, canAdminAi, canUseAi, FreeModel } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/lib/i18n/messages';

const ERROR_CODES = [
  'QUOTA_EXHAUSTED',
  'RATE_LIMITED',
  'PROVIDER_QUOTA_EXHAUSTED',
  'PROVIDER_RATE_LIMITED',
  'PROVIDER_TIMEOUT',
  'PROVIDER_AUTH_FAILED',
  'PROVIDER_NOT_CONFIGURED',
  'PROVIDER_UNAVAILABLE',
  'MODEL_NOT_FREE',
];

type T = (key: MessageKey, params?: Record<string, string | number>) => string;

function describe(e: unknown, t: T): string {
  if (e instanceof ApiError) {
    const help =
      e.code && ERROR_CODES.includes(e.code) ? t(`aip.err.${e.code}` as MessageKey) : undefined;
    const wait = e.retryAfterSeconds ? ` ${t('aip.retry', { n: e.retryAfterSeconds })}` : '';
    return help ? `${help}${wait}` : e.message;
  }
  return (e as Error).message;
}

function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100;
  const tone = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-brand';
  return (
    <div>
      <div className="flex justify-between text-xs text-slate-600">
        <span>{label}</span>
        <span className="font-semibold">
          {used} / {limit}
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ProviderBadge({ id, configured }: { id: string; configured: boolean }) {
  const { t } = useI18n();
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
        configured ? 'bg-green-100 text-green-800' : 'bg-slate-200 text-slate-600'
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${configured ? 'bg-green-500' : 'bg-slate-400'}`} />
      {id} · {configured ? t('aip.connected') : t('aip.notConfiguredShort')}
    </span>
  );
}

const numOrNull = (v: string): number | null =>
  v.trim() === '' ? null : Math.max(0, Math.floor(Number(v)));

export default function AiAdminPage() {
  const { currentOrgId, currentRole } = useApp();
  const { t } = useI18n();
  const admin = canAdminAi(currentRole);
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [models, setModels] = useState<FreeModel[]>([]);
  const [modelsError, setModelsError] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [model, setModel] = useState('');
  const [limits, setLimits] = useState({
    dailyText: '',
    monthlyText: '',
    dailyImage: '',
    monthlyImage: '',
  });
  const [saving, setSaving] = useState(false);

  const [textPrompt, setTextPrompt] = useState(
    'Write one friendly sentence welcoming new students.',
  );
  const [textBusy, setTextBusy] = useState(false);
  const [textResult, setTextResult] = useState<{
    text: string;
    model: string;
    provider: string;
  } | null>(null);
  const [textError, setTextError] = useState('');

  const [imgPrompt, setImgPrompt] = useState(
    'A bright modern university library, students studying, natural light',
  );
  const [imgSteps, setImgSteps] = useState(4);
  const [imgBusy, setImgBusy] = useState(false);
  const [imgResult, setImgResult] = useState<{ src: string; model: string } | null>(null);
  const [imgError, setImgError] = useState('');

  const base = `/organizations/${currentOrgId}/ai`;

  const load = useCallback(async () => {
    if (!currentOrgId) return;
    try {
      const s = await apiFetch<AiStatus>(`${base}/status`);
      setStatus(s);
      setModel(s.settings?.textModel ?? '');
      setLimits({
        dailyText: s.settings?.dailyTextLimit?.toString() ?? '',
        monthlyText: s.settings?.monthlyTextLimit?.toString() ?? '',
        dailyImage: s.settings?.dailyImageLimit?.toString() ?? '',
        monthlyImage: s.settings?.monthlyImageLimit?.toString() ?? '',
      });
    } catch (e) {
      setError(describe(e, t));
    }
    try {
      setModels((await apiFetch<{ models: FreeModel[] }>(`${base}/models`)).models);
    } catch (e) {
      setModelsError(describe(e, t));
    }
  }, [currentOrgId, base, t]);

  useEffect(() => {
    setStatus(null);
    load();
  }, [load]);

  async function saveSettings(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await apiFetch(`${base}/settings`, {
        method: 'PUT',
        body: JSON.stringify({
          textModel: model || null,
          dailyTextLimit: numOrNull(limits.dailyText),
          monthlyTextLimit: numOrNull(limits.monthlyText),
          dailyImageLimit: numOrNull(limits.dailyImage),
          monthlyImageLimit: numOrNull(limits.monthlyImage),
        }),
      });
      setNotice(t('aip.saved'));
      await load();
    } catch (e) {
      setError(describe(e, t));
    }
    setSaving(false);
  }

  async function runText() {
    setTextBusy(true);
    setTextError('');
    setTextResult(null);
    try {
      setTextResult(
        await apiFetch(`${base}/test-text`, {
          method: 'POST',
          body: JSON.stringify({ prompt: textPrompt }),
        }),
      );
    } catch (e) {
      setTextError(describe(e, t));
    }
    setTextBusy(false);
    load();
  }

  async function runImage() {
    setImgBusy(true);
    setImgError('');
    setImgResult(null);
    try {
      const r = await apiFetch<{ imageBase64: string; mimeType: string; model: string }>(
        `${base}/test-image`,
        {
          method: 'POST',
          body: JSON.stringify({ prompt: imgPrompt, steps: imgSteps }),
        },
      );
      setImgResult({ src: `data:${r.mimeType};base64,${r.imageBase64}`, model: r.model });
    } catch (e) {
      setImgError(describe(e, t));
    }
    setImgBusy(false);
    load();
  }

  if (!canUseAi(currentRole)) {
    return (
      <section className="card p-6">
        <h1 className="text-xl font-bold">{t('aip.titleShort')}</h1>
        <p className="mt-2 text-sm text-slate-500">{t('aip.noAccess')}</p>
      </section>
    );
  }
  if (!status) return <p className="text-sm text-slate-500">{error || t('common.loading')}</p>;

  const textOk = status.providers.text.some((p) => p.configured);
  const imageOk = status.providers.image.some((p) => p.configured);

  return (
    <div className="space-y-4">
      <section className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-bold">{t('aip.title')}</h1>
          <span className="rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand">
            {t('aip.freeOnly')}
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-500">{t('aip.subtitle')}</p>
        {error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {notice && (
          <p className="mt-3 rounded-lg bg-green-50 p-3 text-sm text-green-800">{notice}</p>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card space-y-3 p-6">
          <h2 className="font-bold">{t('aip.text')}</h2>
          <div className="flex flex-wrap gap-2">
            {status.providers.text.map((p) => (
              <ProviderBadge key={p.id} {...p} />
            ))}
          </div>
          <p className="text-sm text-slate-600">
            {t('aip.activeModel')}{' '}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{status.textModel}</code>
          </p>
          <Meter
            label={t('aip.today')}
            used={status.usage.text.today}
            limit={status.limits.dailyText}
          />
          <Meter
            label={t('aip.month')}
            used={status.usage.text.month}
            limit={status.limits.monthlyText}
          />
          {!textOk && (
            <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
              {t('aip.textNotConfigured')}
            </p>
          )}
        </section>

        <section className="card space-y-3 p-6">
          <h2 className="font-bold">{t('aip.images')}</h2>
          <div className="flex flex-wrap gap-2">
            {status.providers.image.map((p) => (
              <ProviderBadge key={p.id} {...p} />
            ))}
          </div>
          <p className="text-sm text-slate-600">
            {t('aip.model')}{' '}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">FLUX.1 schnell</code>
          </p>
          <Meter
            label={t('aip.today')}
            used={status.usage.image.today}
            limit={status.limits.dailyImage}
          />
          <Meter
            label={t('aip.month')}
            used={status.usage.image.month}
            limit={status.limits.monthlyImage}
          />
          {!imageOk && (
            <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
              {t('aip.imageNotConfigured')}
            </p>
          )}
        </section>
      </div>

      {admin ? (
        <form onSubmit={saveSettings} className="card space-y-4 p-6">
          <h2 className="font-bold">{t('aip.settings')}</h2>
          <label className="block text-sm">
            <span className="font-semibold">{t('aip.textModel')}</span>
            <select className="input mt-1" value={model} onChange={(e) => setModel(e.target.value)}>
              <option value="">{t('aip.defaultModel')}</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id}
                  {m.supportsJson ? ' · JSON' : ''}
                </option>
              ))}
            </select>
            {modelsError ? (
              <span className="mt-1 block text-xs text-amber-700">
                {t('aip.modelsFailed', { error: modelsError })}
              </span>
            ) : (
              <span className="mt-1 block text-xs text-slate-500">
                {t('aip.modelsLive', { n: models.length })}
              </span>
            )}
          </label>
          <div>
            <p className="text-sm font-semibold">{t('aip.limits')}</p>
            <p className="text-xs text-slate-500">{t('aip.limitsHint')}</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {(
                [
                  ['dailyText', 'aip.textDay', status.limits.dailyText],
                  ['monthlyText', 'aip.textMonth', status.limits.monthlyText],
                  ['dailyImage', 'aip.imageDay', status.limits.dailyImage],
                  ['monthlyImage', 'aip.imageMonth', status.limits.monthlyImage],
                ] as const
              ).map(([key, label, current]) => (
                <label key={key} className="block text-xs font-semibold text-slate-600">
                  {t(label)}
                  <input
                    className="input mt-1"
                    type="number"
                    min={0}
                    placeholder={t('aip.now', { n: current })}
                    value={limits[key]}
                    onChange={(e) => setLimits((l) => ({ ...l, [key]: e.target.value }))}
                  />
                </label>
              ))}
            </div>
          </div>
          <button className="btn-primary" disabled={saving}>
            {saving ? t('det.saving') : t('aip.saveSettings')}
          </button>
        </form>
      ) : (
        <p className="rounded-lg bg-slate-100 p-3 text-sm text-slate-600">{t('aip.adminOnly')}</p>
      )}

      {admin && (
        <div className="grid gap-4 md:grid-cols-2">
          <section className="card space-y-3 p-6">
            <h2 className="font-bold">{t('aip.testText')}</h2>
            <textarea
              className="input"
              rows={3}
              maxLength={2000}
              value={textPrompt}
              onChange={(e) => setTextPrompt(e.target.value)}
            />
            <button
              className="btn-primary"
              disabled={textBusy || !textPrompt.trim()}
              onClick={runText}
            >
              {textBusy ? t('aip.generating') : t('aip.runText')}
            </button>
            {textError && (
              <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{textError}</p>
            )}
            {textResult && (
              <div className="rounded-lg bg-slate-50 p-3 text-sm">
                <p className="whitespace-pre-wrap">{textResult.text}</p>
                <p className="mt-2 text-xs text-slate-400">
                  {textResult.provider} · {textResult.model}
                </p>
              </div>
            )}
          </section>

          <section className="card space-y-3 p-6">
            <h2 className="font-bold">{t('aip.testImage')}</h2>
            <textarea
              className="input"
              rows={3}
              maxLength={2048}
              value={imgPrompt}
              onChange={(e) => setImgPrompt(e.target.value)}
            />
            <label className="flex items-center gap-2 text-sm">
              {t('aip.steps')}
              <input
                className="input !w-20"
                type="number"
                min={1}
                max={8}
                value={imgSteps}
                onChange={(e) => setImgSteps(Math.min(8, Math.max(1, Number(e.target.value) || 4)))}
              />
            </label>
            <button
              className="btn-primary"
              disabled={imgBusy || !imgPrompt.trim()}
              onClick={runImage}
            >
              {imgBusy ? t('aip.generating') : t('aip.runImage')}
            </button>
            {imgError && (
              <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{imgError}</p>
            )}
            {imgResult && (
              <div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imgResult.src}
                  alt={t('aip.generatedAlt')}
                  className="w-full rounded-lg border border-slate-200"
                />
                <p className="mt-1 text-xs text-slate-400">{imgResult.model}</p>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
