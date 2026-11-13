'use client';

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { detectLocale, dirOf, isLocale, Locale, MessageKey, translate } from './messages';

export const LOCALE_STORAGE_KEY = 'aich.locale';

interface I18n {
  locale: Locale;
  dir: 'ltr' | 'rtl';
  setLocale: (l: Locale) => void;
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
}

const Ctx = createContext<I18n | null>(null);

/**
 * The interface language. It starts in English (what the server renders), then switches to the saved
 * choice, or to the browser's language when it is French or Arabic. Arabic flips the page right-to-left.
 */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(LOCALE_STORAGE_KEY);
    } catch {
      // private mode: fall back to the browser language
    }
    setLocaleState(isLocale(saved) ? saved : detectLocale(navigator.languages));
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dirOf(locale);
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, l);
    } catch {
      // not remembered, but the page still switches
    }
  }, []);

  const value = useMemo<I18n>(
    () => ({
      locale,
      dir: dirOf(locale),
      setLocale,
      t: (key, params) => translate(locale, key, params),
    }),
    [locale, setLocale],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error('useI18n must be used inside LocaleProvider');
  return v;
}

/** Shortcut for components that only need the translate function. */
export const useT = () => useI18n().t;
