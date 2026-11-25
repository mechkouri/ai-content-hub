'use client';

import { Check, Download, PenLine, Search } from 'lucide-react';
import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { apiFetch, canWriteContent, LANG_LABELS, Lang } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { describeError } from '@/lib/errors';
import { useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/lib/i18n/messages';
import { planToCsv, SeoPlan, writeArticleLink } from '@/lib/seo-plan';

export default function SeoPlanPage() {
  const { currentOrgId, currentRole } = useApp();
  const { t, locale } = useI18n();
  const canWrite = canWriteContent(currentRole);
  const [business, setBusiness] = useState('');
  const [location, setLocation] = useState('');
  const [audience, setAudience] = useState('');
  const [website, setWebsite] = useState('');
  const [language, setLanguage] = useState<Lang>(locale as Lang);
  const [plan, setPlan] = useState<SeoPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const storageKey = `aich.seoPlan.${currentOrgId}`;

  // The last plan is kept in this browser, so leaving the page does not lose it.
  useEffect(() => {
    setPlan(null);
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
      if (saved?.plan?.articles) {
        setPlan(saved.plan);
        setBusiness(saved.input.business ?? '');
        setLocation(saved.input.location ?? '');
        setAudience(saved.input.audience ?? '');
        setWebsite(saved.input.website ?? '');
        if (saved.input.language) setLanguage(saved.input.language);
      }
    } catch {
      /* a saved plan is a convenience only */
    }
  }, [storageKey]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const site = website.trim();
    const input = {
      business: business.trim(),
      language,
      ...(location.trim() ? { location: location.trim() } : {}),
      ...(audience.trim() ? { audience: audience.trim() } : {}),
      ...(site ? { website: /^https?:\/\//i.test(site) ? site : `https://${site}` } : {}),
    };
    try {
      const result = await apiFetch<SeoPlan>(`/organizations/${currentOrgId}/seo/plan`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
      setPlan(result);
      try {
        localStorage.setItem(storageKey, JSON.stringify({ input, plan: result }));
      } catch {
        /* a saved plan is a convenience only */
      }
    } catch (err) {
      setError(describeError(err));
    }
    setBusy(false);
  }

  function exportCsv() {
    if (!plan) return;
    const csv = planToCsv(plan, [
      t('strat.csv.priority'),
      t('strat.csv.title'),
      t('strat.csv.keyword'),
      t('strat.csv.intent'),
      t('strat.csv.outline'),
    ]);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'seo-plan.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function copy(keyword: string) {
    try {
      await navigator.clipboard.writeText(keyword);
      setCopied(keyword);
      setTimeout(() => setCopied(''), 1500);
    } catch {
      setError(t('det.copyDenied'));
    }
  }

  const failing = plan?.site?.checks.filter((c) => !c.ok) ?? [];
  const passing = plan?.site?.checks.filter((c) => c.ok) ?? [];
  const intent = (i: string) => t(`strat.intent.${i}` as MessageKey);

  return (
    <div className="space-y-5">
      <section>
        <h1 className="font-display text-[28px] font-semibold leading-tight">{t('strat.title')}</h1>
        <p className="text-sm text-muted">{t('strat.subtitle')}</p>
      </section>

      {canWrite ? (
        <form onSubmit={create} className="card space-y-4 p-6">
          <label className="block text-sm">
            <span className="font-semibold">{t('strat.business')}</span>
            <textarea
              className="input mt-1"
              rows={3}
              required
              minLength={10}
              maxLength={600}
              dir="auto"
              placeholder={t('strat.businessPh')}
              value={business}
              onChange={(e) => setBusiness(e.target.value)}
              disabled={busy}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-semibold">{t('strat.website')}</span>
              <input
                className="input mt-1"
                dir="ltr"
                maxLength={2000}
                placeholder="www.example.com"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                disabled={busy}
              />
            </label>
            <label className="block text-sm">
              <span className="font-semibold">{t('strat.location')}</span>
              <input
                className="input mt-1"
                dir="auto"
                maxLength={100}
                placeholder={t('strat.locationPh')}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                disabled={busy}
              />
            </label>
            <label className="block text-sm">
              <span className="font-semibold">{t('studio.audience')}</span>
              <input
                className="input mt-1"
                dir="auto"
                maxLength={150}
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                disabled={busy}
              />
            </label>
            <label className="block text-sm">
              <span className="font-semibold">{t('studio.language')}</span>
              <select
                className="input mt-1"
                value={language}
                onChange={(e) => setLanguage(e.target.value as Lang)}
                disabled={busy}
              >
                {Object.entries(LANG_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn-primary" disabled={busy || business.trim().length < 10}>
              <Search size={15} aria-hidden /> {busy ? t('strat.working') : t('strat.go')}
            </button>
            <p className="text-xs text-muted">{t('strat.cost')}</p>
          </div>
          {error && (
            <p className="rounded-lg border border-red-200 bg-danger-soft p-3 text-sm text-danger-ink">
              {error}
            </p>
          )}
        </form>
      ) : (
        <p className="rounded-lg bg-slate-100 p-3 text-sm text-slate-600">{t('studio.readOnly')}</p>
      )}

      {plan && (
        <>
          <section className="card p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p className="max-w-2xl text-sm" dir="auto">
                {plan.summary}
              </p>
              <button type="button" className="btn-ghost btn-sm" onClick={exportCsv}>
                <Download size={14} aria-hidden /> {t('strat.export')}
              </button>
            </div>
            <p className="mt-3 text-xs text-muted">{t('strat.honest')}</p>
          </section>

          {plan.siteError && (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              {t('strat.siteFailed')} {describeError(new Error(plan.siteError))}
            </p>
          )}
          {plan.site && (
            <section className="card p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-display text-lg font-semibold">{t('strat.health')}</h2>
                  <p className="break-all text-xs text-muted" dir="ltr">
                    {plan.site.url}
                  </p>
                </div>
                <p className="text-3xl font-bold" aria-label={t('strat.health')}>
                  {plan.site.score}
                  <span className="text-sm font-normal text-muted">/100</span>
                </p>
              </div>
              {failing.length > 0 ? (
                <>
                  <h3 className="mt-3 text-sm font-semibold">{t('strat.fixFirst')}</h3>
                  <ol className="mt-2 space-y-2">
                    {failing.map((c) => (
                      <li key={c.id} className="flex gap-2 text-sm">
                        <span
                          className={`mt-0.5 shrink-0 rounded-full px-2 text-[11px] font-semibold ${
                            c.impact === 1
                              ? 'bg-red-100 text-red-800'
                              : c.impact === 2
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {t(`site.impact.${c.impact}` as MessageKey)}
                        </span>
                        <span>{t(`site.${c.id}` as MessageKey, c.params)}</span>
                      </li>
                    ))}
                  </ol>
                </>
              ) : (
                <p className="mt-3 text-sm text-ok-ink">{t('strat.allGood')}</p>
              )}
              <p className="mt-3 text-xs text-muted">
                {t('strat.passed', { ok: passing.length, total: plan.site.checks.length })}
              </p>
            </section>
          )}

          <section className="card p-6">
            <h2 className="font-display text-lg font-semibold">{t('strat.articles')}</h2>
            <p className="text-xs text-muted">{t('strat.articlesHint')}</p>
            <ol className="mt-3 divide-y divide-line">
              {plan.articles.map((a) => (
                <li
                  key={a.title}
                  className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
                      <span className="rounded-full bg-brand-soft px-2 py-0.5 text-brand-dark">
                        {t(`strat.priority.${a.priority}` as MessageKey)}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
                        {intent(a.intent)}
                      </span>
                      {a.covered && (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-green-800">
                          <Check size={11} className="inline" aria-hidden /> {t('strat.covered')}
                        </span>
                      )}
                    </p>
                    <h3 className="mt-1 font-semibold" dir="auto">
                      {a.title}
                    </h3>
                    <p className="text-xs text-muted" dir="auto">
                      {t('strat.keyword')} <strong>{a.keyword}</strong>
                    </p>
                    {a.why && (
                      <p className="mt-1 text-sm text-slate-600" dir="auto">
                        {a.why}
                      </p>
                    )}
                    {a.outline.length > 0 && (
                      <details className="mt-1 text-sm">
                        <summary className="cursor-pointer text-xs font-semibold text-brand">
                          {t('strat.outline')}
                        </summary>
                        <ul className="mt-1 list-disc ps-5 text-slate-600">
                          {a.outline.map((o) => (
                            <li key={o} dir="auto">
                              {o}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                  {canWrite && (
                    <Link
                      href={writeArticleLink(a.title, a.keyword)}
                      className="btn-primary btn-sm"
                    >
                      <PenLine size={14} aria-hidden /> {t('strat.write')}
                    </Link>
                  )}
                </li>
              ))}
            </ol>
          </section>

          <section className="card p-6">
            <h2 className="font-display text-lg font-semibold">{t('strat.keywords')}</h2>
            <p className="text-xs text-muted">{t('strat.keywordsHint')}</p>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              {plan.clusters.map((c) => (
                <div key={c.name} className="rounded-xl border border-line p-4">
                  <p className="font-semibold" dir="auto">
                    {c.name}
                  </p>
                  <p className="text-xs text-muted">{intent(c.intent)}</p>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {c.keywords.map((k) => (
                      <li key={k}>
                        <button
                          type="button"
                          dir="auto"
                          onClick={() => copy(k)}
                          className="rounded-full border border-line bg-white px-3 py-1 text-xs hover:border-brand hover:bg-brand-soft"
                        >
                          {copied === k ? t('seo.copied') : k}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          {plan.quickWins.length > 0 && (
            <section className="card p-6">
              <h2 className="font-display text-lg font-semibold">{t('strat.wins')}</h2>
              <ul className="mt-2 list-disc space-y-1 ps-5 text-sm">
                {plan.quickWins.map((w) => (
                  <li key={w} dir="auto">
                    {w}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
