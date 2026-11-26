'use client';

import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { describeError } from '@/lib/errors';
import { useI18n } from '@/lib/i18n';

interface Suggestion {
  titles: string[];
  descriptions: string[];
  tags: string | null;
}

/** Turns a "title is wrong" finding into text the client can paste. */
export function PageFix({ orgId, url }: { orgId: string; url: string }) {
  const { t, locale } = useI18n();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Suggestion | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  async function ask() {
    setBusy(true);
    setError('');
    try {
      setResult(
        await apiFetch<Suggestion>(`/organizations/${orgId}/seo/page-snippet`, {
          method: 'POST',
          body: JSON.stringify({ website: url, language: locale }),
        }),
      );
    } catch (e) {
      setError(describeError(e));
    }
    setBusy(false);
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError(t('det.copyDenied'));
    }
  }

  const list = (label: string, items: string[]) =>
    items.length > 0 && (
      <div>
        <p className="font-semibold">{label}</p>
        <ul className="list-disc ps-5">
          {items.map((i) => (
            <li key={i} dir="auto">
              {i}
            </li>
          ))}
        </ul>
      </div>
    );

  return (
    <div className="mb-2 mt-1 break-normal" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={ask}>
        <Sparkles size={13} aria-hidden /> {busy ? t('fix.working') : t('fix.suggest')}
      </button>
      {error && <p className="mt-1 text-danger-ink">{error}</p>}
      {result && (
        <div className="mt-2 space-y-2 rounded-lg border border-line bg-surface p-3 text-slate-700">
          {!result.titles.length && !result.descriptions.length && <p>{t('fix.none')}</p>}
          {list(t('fix.titles'), result.titles)}
          {list(t('fix.descriptions'), result.descriptions)}
          {result.tags && (
            <div>
              <p className="font-semibold">{t('fix.paste')}</p>
              <pre
                className="mt-1 overflow-x-auto whitespace-pre-wrap break-words rounded bg-slate-900 p-2 text-[11px] text-slate-100"
                dir="ltr"
              >
                {result.tags}
              </pre>
              <button
                type="button"
                className="btn-ghost btn-sm mt-1"
                onClick={() => copy(result.tags!)}
              >
                {copied ? t('seo.copied') : t('fix.copy')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
