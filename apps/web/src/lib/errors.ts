import { ApiError } from './api';

const HELP: Record<string, string> = {
  QUOTA_EXHAUSTED: 'Your organization reached its AI generation limit. It resets automatically.',
  RATE_LIMITED: 'Too many AI requests in a short time. Wait a moment and try again.',
  PROVIDER_QUOTA_EXHAUSTED: 'The free AI allowance is used up for now. Try again later.',
  PROVIDER_RATE_LIMITED: 'The AI provider is busy. Try again in a moment.',
  PROVIDER_TIMEOUT: 'The AI provider took too long. Try again.',
  PROVIDER_AUTH_FAILED: 'The AI provider key on the server is wrong or expired.',
  PROVIDER_NOT_CONFIGURED: 'AI is not set up on the server yet (missing provider key).',
  PROVIDER_UNAVAILABLE: 'The AI provider is temporarily unavailable.',
  SOURCE_NOT_READY: 'Extract and review the facts of this source first.',
  NO_VERIFIED_FACTS:
    'This source has no verified facts yet. Open it and confirm or add facts first.',
  MODEL_NOT_FREE: 'That model is not free. Only free models can be used.',
  INVALID_AI_OUTPUT: 'The AI did not return a usable answer. Try again.',
};

/** Turns an API failure into a sentence a non-technical user can act on. */
export function describeError(e: unknown): string {
  if (e instanceof ApiError) {
    const help = e.code ? HELP[e.code] : undefined;
    if (help) return e.retryAfterSeconds ? `${help} (retry in ~${e.retryAfterSeconds}s)` : help;
    return e.message;
  }
  return (e as Error).message || 'Something went wrong.';
}

/** The API stores extraction failures as "CODE: message". */
export function describeStoredExtractionError(stored: string | null): string | null {
  if (!stored) return null;
  const code = stored.split(':')[0]?.trim();
  return HELP[code] ?? stored.slice(stored.indexOf(':') + 1).trim();
}
