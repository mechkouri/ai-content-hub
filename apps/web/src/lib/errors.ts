import { ApiError } from './api';
import { isLocale, Locale } from './i18n/messages';
import { translateServerMessage } from './i18n/server-messages';

type Triple = readonly [en: string, fr: string, ar: string];

const HELP: Record<string, Triple> = {
  QUOTA_EXHAUSTED: [
    'Your organization reached its AI generation limit. It resets automatically.',
    'Votre organisation a atteint sa limite de génération par IA. Elle se réinitialise automatiquement.',
    'بلغت مؤسستك حد التوليد بالذكاء الاصطناعي. تتم إعادة التعيين تلقائيًا.',
  ],
  RATE_LIMITED: [
    'Too many AI requests in a short time. Wait a moment and try again.',
    'Trop de requêtes d’IA en peu de temps. Patientez un instant puis réessayez.',
    'طلبات ذكاء اصطناعي كثيرة في وقت قصير. انتظر قليلًا ثم حاول مجددًا.',
  ],
  PROVIDER_QUOTA_EXHAUSTED: [
    'The free AI allowance is used up for now. Try again later.',
    'Le quota gratuit d’IA est épuisé pour le moment. Réessayez plus tard.',
    'استُنفدت الحصة المجانية للذكاء الاصطناعي حاليًا. حاول لاحقًا.',
  ],
  PROVIDER_RATE_LIMITED: [
    'The AI provider is busy. Try again in a moment.',
    'Le fournisseur d’IA est occupé. Réessayez dans un instant.',
    'مزوّد الذكاء الاصطناعي مشغول. حاول مجددًا بعد قليل.',
  ],
  PROVIDER_TIMEOUT: [
    'The AI provider took too long. Try again.',
    'Le fournisseur d’IA a mis trop de temps. Réessayez.',
    'استغرق مزوّد الذكاء الاصطناعي وقتًا طويلًا. حاول مجددًا.',
  ],
  PROVIDER_AUTH_FAILED: [
    'The AI provider key on the server is wrong or expired.',
    'La clé du fournisseur d’IA sur le serveur est incorrecte ou expirée.',
    'مفتاح مزوّد الذكاء الاصطناعي على الخادم خاطئ أو منتهي.',
  ],
  PROVIDER_NOT_CONFIGURED: [
    'AI is not set up on the server yet (missing provider key).',
    'L’IA n’est pas encore configurée sur le serveur (clé du fournisseur manquante).',
    'الذكاء الاصطناعي غير مُعدّ على الخادم بعد (مفتاح المزوّد مفقود).',
  ],
  PROVIDER_UNAVAILABLE: [
    'The AI provider is temporarily unavailable.',
    'Le fournisseur d’IA est temporairement indisponible.',
    'مزوّد الذكاء الاصطناعي غير متاح مؤقتًا.',
  ],
  SOURCE_NOT_READY: [
    'Extract and review the facts of this source first.',
    'Extrayez et vérifiez d’abord les faits de cette source.',
    'استخرج حقائق هذا المصدر وراجعها أولًا.',
  ],
  NO_VERIFIED_FACTS: [
    'This source has no verified facts yet. Open it and confirm or add facts first.',
    'Cette source n’a pas encore de faits vérifiés. Ouvrez-la puis confirmez ou ajoutez des faits.',
    'ليس لهذا المصدر حقائق موثقة بعد. افتحه وأكّد الحقائق أو أضفها أولًا.',
  ],
  MODEL_NOT_FREE: [
    'That model is not free. Only free models can be used.',
    'Ce modèle n’est pas gratuit. Seuls les modèles gratuits peuvent être utilisés.',
    'هذا النموذج ليس مجانيًا. يمكن استخدام النماذج المجانية فقط.',
  ],
  INVALID_AI_OUTPUT: [
    'The AI did not return a usable answer. Try again.',
    'L’IA n’a pas renvoyé de réponse exploitable. Réessayez.',
    'لم يُرجع الذكاء الاصطناعي إجابة صالحة للاستخدام. حاول مجددًا.',
  ],
};

const GENERIC: Triple = ['Something went wrong.', 'Une erreur s’est produite.', 'حدث خطأ ما.'];

/** The language the page is shown in (the app keeps it on the html element). */
function currentLocale(): Locale {
  const lang = typeof document !== 'undefined' ? document.documentElement.lang : 'en';
  return isLocale(lang) ? lang : 'en';
}

const pick = (t: Triple, locale: Locale) =>
  locale === 'fr' ? t[1] : locale === 'ar' ? t[2] : t[0];

/** Turns an API failure into a sentence a non-technical user can act on, in the interface language. */
export function describeError(e: unknown, locale: Locale = currentLocale()): string {
  if (e instanceof ApiError) {
    const help = e.code ? HELP[e.code] : undefined;
    if (help) {
      const text = pick(help, locale);
      if (!e.retryAfterSeconds) return text;
      const n = e.retryAfterSeconds;
      return `${text} ${locale === 'fr' ? `(réessayez dans ~${n} s)` : locale === 'ar' ? `(أعد المحاولة بعد ~${n} ث)` : `(retry in ~${n}s)`}`;
    }
    return translateServerMessage(locale, e.message);
  }
  const message = (e as Error)?.message;
  return message ? translateServerMessage(locale, message) : pick(GENERIC, locale);
}

/** The API stores extraction failures as "CODE: message". */
export function describeStoredExtractionError(
  stored: string | null,
  locale: Locale = currentLocale(),
): string | null {
  if (!stored) return null;
  const code = stored.split(':')[0]?.trim();
  const help = HELP[code];
  return help
    ? pick(help, locale)
    : translateServerMessage(locale, stored.slice(stored.indexOf(':') + 1).trim());
}
