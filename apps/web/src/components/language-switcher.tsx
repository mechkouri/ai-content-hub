'use client';

import { Languages } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { isLocale, LOCALE_NAMES, LOCALES } from '@/lib/i18n/messages';

/** Picks the interface language. Each language is listed under its own name. */
export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <label
      className={`relative flex h-10 items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 hover:border-line-strong ${className}`}
    >
      <Languages size={15} className="text-muted" aria-hidden />
      <span className="sr-only">{t('lang.label')}</span>
      <select
        aria-label={t('lang.label')}
        className="cursor-pointer appearance-none bg-transparent text-sm font-medium text-ink outline-none"
        value={locale}
        onChange={(e) => isLocale(e.target.value) && setLocale(e.target.value)}
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
