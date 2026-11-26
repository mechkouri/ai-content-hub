'use client';

import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/lib/i18n/messages';
import { BUSINESS_KINDS, businessSchema } from '@/lib/site-fixes';

/** Lines to paste into a web page, with a copy button. */
export function CodeLines({ code }: { code: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-1 break-normal">
      <pre
        className="overflow-x-auto whitespace-pre-wrap break-words rounded bg-slate-900 p-2 text-[11px] text-slate-100"
        dir="ltr"
      >
        {code}
      </pre>
      <button
        type="button"
        className="btn-ghost btn-sm mt-1"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* the lines stay selectable */
          }
        }}
      >
        {copied ? t('seo.copied') : t('fix.copy')}
      </button>
    </div>
  );
}

/** A short form that writes the structured data search engines read about a business. */
export function BusinessSchemaForm({ url }: { url: string }) {
  const { t } = useI18n();
  const [details, setDetails] = useState({
    type: 'LocalBusiness',
    name: '',
    phone: '',
    street: '',
    city: '',
    hours: '',
  });
  const set = (key: keyof typeof details, value: string) =>
    setDetails((d) => ({ ...d, [key]: value }));

  const field = (key: 'name' | 'phone' | 'street' | 'city' | 'hours', placeholder?: string) => (
    <label className="block text-xs">
      <span className="font-semibold">{t(`biz.${key}` as MessageKey)}</span>
      <input
        className="input mt-1"
        dir="auto"
        maxLength={120}
        placeholder={placeholder}
        value={details[key]}
        onChange={(e) => set(key, e.target.value)}
      />
    </label>
  );

  return (
    <div className="mt-2 rounded-lg border border-line bg-surface p-3">
      <p className="text-xs text-muted">{t('biz.hint')}</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <label className="block text-xs">
          <span className="font-semibold">{t('biz.type')}</span>
          <select
            className="input mt-1"
            value={details.type}
            onChange={(e) => set('type', e.target.value)}
          >
            {BUSINESS_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`biz.kind.${k}` as MessageKey)}
              </option>
            ))}
          </select>
        </label>
        {field('name')}
        {field('phone')}
        {field('street')}
        {field('city')}
        {field('hours', 'Mo-Fr 09:00-18:00')}
      </div>
      {details.name.trim() && (
        <>
          <p className="mt-2 text-xs font-semibold">{t('fix.paste')}</p>
          <CodeLines code={businessSchema({ ...details, url })} />
        </>
      )}
    </div>
  );
}
