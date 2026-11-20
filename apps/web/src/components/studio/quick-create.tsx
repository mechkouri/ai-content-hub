'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { BUSINESS_TYPES, BusinessType, businessTable, hasBlanks } from '@/lib/business-ideas';
import { apiFetch, CONTENT_KINDS, ContentDetail, ContentKind, SourceDetail } from '@/lib/api';
import { describeError } from '@/lib/errors';
import { useI18n } from '@/lib/i18n';

const IS_URL = /^https?:\/\/\S+$/i;

/**
 * The shortest way to a first draft: paste text (or a web address), pick what to create, press one button.
 * It saves the text as a source, reads the facts out of it and writes the draft from the facts it could confirm.
 */
export function QuickCreate({ orgId }: { orgId: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [input, setInput] = useState('');
  const [kind, setKind] = useState<ContentKind>('INSTAGRAM');
  const [step, setStep] = useState<'' | 'reading' | 'writing'>('');
  const [error, setError] = useState('');
  const [reviewId, setReviewId] = useState('');

  const [business, setBusiness] = useState<BusinessType | ''>('');
  useEffect(() => {
    try {
      const saved = localStorage.getItem('aich.business');
      if (BUSINESS_TYPES.includes(saved as BusinessType)) setBusiness(saved as BusinessType);
    } catch {
      /* remembering the choice is optional */
    }
  }, []);
  const table = businessTable(locale);
  const pickBusiness = (b: BusinessType | '') => {
    setBusiness(b);
    try {
      localStorage.setItem('aich.business', b);
    } catch {
      /* remembering the choice is optional */
    }
  };

  const base = `/organizations/${orgId}`;
  const value = input.trim();
  const busy = step !== '';
  const blanks = hasBlanks(value);

  async function go(e: FormEvent) {
    e.preventDefault();
    setError('');
    setReviewId('');
    setStep('reading');
    try {
      const isUrl = IS_URL.test(value);
      const src = await apiFetch<SourceDetail>(`${base}/sources/${isUrl ? 'url' : 'text'}`, {
        method: 'POST',
        body: JSON.stringify(isUrl ? { url: value } : { text: value }),
      });
      const id = src.source.id;
      if (src.extraction && !src.extraction.ok) {
        setError(src.extraction.message || t('qc.readFailed'));
        setReviewId(id);
        setStep('');
        return;
      }
      if (src.facts.length - src.unverifiedCount === 0) {
        setError(t('qc.noFacts'));
        setReviewId(id);
        setStep('');
        return;
      }
      setStep('writing');
      const res = await apiFetch<ContentDetail>(`${base}/content/generate`, {
        method: 'POST',
        body: JSON.stringify({
          sourceId: id,
          kind,
          options: { style: 'informative', tone: 'professional', length: 'medium' },
        }),
      });
      router.push(`/studio/${res.piece.id}`);
    } catch (err) {
      setError(describeError(err));
      setStep('');
    }
  }

  return (
    <form onSubmit={go} className="card space-y-4 border-brand p-6">
      <div>
        <h2 className="font-display text-lg font-semibold">{t('qc.title')}</h2>
        <p className="text-sm text-muted">{t('qc.hint')}</p>
      </div>
      <div className="space-y-2">
        <label className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold">{t('qc.business')}</span>
          <select
            className="input !w-auto"
            value={business}
            onChange={(e) => pickBusiness(e.target.value as BusinessType | '')}
            disabled={busy}
          >
            <option value="">{t('qc.businessAny')}</option>
            {BUSINESS_TYPES.map((b) => (
              <option key={b} value={b}>
                {table[b].label}
              </option>
            ))}
          </select>
        </label>
        {business && (
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('qc.ideas')}>
            <span className="self-center text-xs text-muted">{t('qc.ideas')}</span>
            {table[business].ideas.map((idea) => (
              <button
                key={idea.title}
                type="button"
                disabled={busy}
                onClick={() => setInput(idea.text)}
                className="rounded-full border border-line bg-white px-3 py-1 text-xs font-semibold hover:border-brand hover:bg-brand-soft"
              >
                {idea.title}
              </button>
            ))}
          </div>
        )}
      </div>
      <textarea
        className="input min-h-28"
        rows={5}
        maxLength={50000}
        dir="auto"
        placeholder={t('qc.placeholder')}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        disabled={busy}
        aria-label={t('qc.title')}
      />
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('studio.whatCreate')}>
        {CONTENT_KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            disabled={busy}
            aria-pressed={kind === k.id}
            onClick={() => setKind(k.id)}
            className={`rounded-full border-2 px-3 py-1.5 text-sm font-semibold transition ${
              kind === k.id
                ? 'border-brand bg-brand-soft'
                : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <span aria-hidden>{k.icon}</span> {t(`kind.${k.id}`)}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={busy || value.length < 20 || blanks}>
          {step === 'reading' ? t('qc.reading') : step === 'writing' ? t('qc.writing') : t('qc.go')}
        </button>
        {busy && <p className="text-sm text-muted">{t('qc.wait')}</p>}
        {!busy && blanks && <p className="text-sm text-amber-700">{t('qc.fillBlanks')}</p>}
      </div>
      {error && (
        <p className="rounded-lg border border-red-200 bg-danger-soft p-3 text-sm text-danger-ink">
          {error}{' '}
          {reviewId && (
            <Link href={`/sources/${reviewId}`} className="font-semibold underline">
              {t('qc.review')}
            </Link>
          )}
        </p>
      )}
      <p className="text-xs text-muted">{t('qc.safe')}</p>
    </form>
  );
}
