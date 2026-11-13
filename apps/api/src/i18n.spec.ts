// The web app has no test runner of its own. This file tests its translation core (plain TypeScript, no
// React) with the API's Jest setup, so a missing or broken translation fails the build.
// Loaded with require so the API's compiler (rootDir: src) does not try to include web sources.
type Dict = Record<string, string>;
type Locale = 'en' | 'fr' | 'ar';
type MessageKey = string;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const i18n = require('../../web/src/lib/i18n/messages') as {
  en: Dict;
  fr: Dict;
  ar: Dict;
  MESSAGES: Record<Locale, Dict>;
  LOCALES: readonly Locale[];
  LOCALE_NAMES: Record<Locale, string>;
  isLocale: (v: unknown) => boolean;
  dirOf: (l: Locale) => 'ltr' | 'rtl';
  detectLocale: (p: readonly string[] | undefined) => Locale;
  translate: (l: Locale, k: MessageKey, params?: Record<string, string | number>) => string;
};
const { en, fr, ar, MESSAGES, LOCALES, LOCALE_NAMES, isLocale, dirOf, detectLocale, translate } =
  i18n;

const keys = Object.keys(en);
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('translations', () => {
  it('have exactly the same messages in every language', () => {
    for (const l of ['fr', 'ar'] as const) {
      expect(Object.keys(MESSAGES[l]).sort()).toEqual([...keys].sort());
    }
  });

  it('are never empty', () => {
    for (const l of LOCALES) {
      for (const k of keys) expect(`${l}.${k}: ${MESSAGES[l][k].trim()}`).not.toBe(`${l}.${k}: `);
    }
  });

  it('keep the same {placeholders} in every language, so no value is lost or invented', () => {
    for (const k of keys) {
      for (const [name, dict] of [
        ['fr', fr],
        ['ar', ar],
      ] as const) {
        // Arabic may drop the number for "one" (e.g. "تفصيل واحد"), which has no placeholder in English either.
        expect({ key: k, lang: name, placeholders: placeholders(dict[k]) }).toEqual({
          key: k,
          lang: name,
          placeholders: k === 'dash.detailsOne' && name === 'ar' ? [] : placeholders(en[k]),
        });
      }
    }
  });

  it('really are translated: French and Arabic differ from English for ordinary sentences', () => {
    const sentences = keys.filter((k) => en[k].length > 25);
    expect(sentences.length).toBeGreaterThan(20);
    for (const k of sentences) {
      expect(fr[k]).not.toBe(en[k]);
      expect(ar[k]).not.toBe(en[k]);
    }
    // Arabic text is Arabic script (apart from product names and numbers).
    const arabic = /[؀-ۿ]/;
    for (const k of keys.filter((x) => !/^kind\.(INSTAGRAM|FACEBOOK|LINKEDIN)$/.test(x))) {
      expect(arabic.test(ar[k])).toBe(true);
    }
  });
});

describe('translate', () => {
  it('fills placeholders and keeps unknown ones visible', () => {
    expect(translate('en', 'dash.stepsDone', { done: 2, total: 4 })).toBe('2 of 4 done');
    expect(translate('fr', 'dash.stepsDone', { done: 2, total: 4 })).toBe('2 sur 4 terminées');
    expect(translate('ar', 'time.minAgo', { n: 5 })).toBe('منذ 5 دقيقة');
    expect(translate('en', 'gate.title', {})).toBe('Log in to use {feature}'); // missing value stays visible
    expect(translate('en', 'nav.overview')).toBe('Overview');
  });

  it('falls back to English when a translation is missing', () => {
    const broken = { ...fr } as Record<string, string>;
    delete broken['nav.overview'];
    const original = MESSAGES.fr;
    (MESSAGES as any).fr = broken;
    try {
      expect(translate('fr', 'nav.overview')).toBe('Overview');
    } finally {
      (MESSAGES as any).fr = original;
    }
  });

  it('does not treat values as markup or as further placeholders', () => {
    expect(translate('en', 'gate.title', { feature: '{n} <b>x</b>' })).toBe(
      'Log in to use {n} <b>x</b>',
    );
  });
});

describe('language helpers', () => {
  it('knows the supported languages and their own names', () => {
    expect(LOCALES).toEqual(['en', 'fr', 'ar']);
    expect(LOCALE_NAMES).toEqual({ en: 'English', fr: 'Français', ar: 'العربية' });
    expect(isLocale('fr')).toBe(true);
    for (const bad of ['de', 'FR', '', null, undefined, 3]) expect(isLocale(bad)).toBe(false);
  });

  it('writes Arabic right-to-left and the others left-to-right', () => {
    expect(dirOf('ar')).toBe('rtl');
    expect(dirOf('en')).toBe('ltr');
    expect(dirOf('fr')).toBe('ltr');
  });

  it('picks the first supported browser language, ignoring regions and case', () => {
    expect(detectLocale(['fr-MA', 'en'])).toBe('fr');
    expect(detectLocale(['de-DE', 'ar-MA', 'fr'])).toBe('ar');
    expect(detectLocale(['EN-us'])).toBe('en');
    expect(detectLocale(['de', 'es'])).toBe('en');
    expect(detectLocale([])).toBe('en');
    expect(detectLocale(undefined)).toBe('en');
  });
});
