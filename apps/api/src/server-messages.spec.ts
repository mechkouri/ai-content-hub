// The web app shows the API's English error messages in French and Arabic by exact lookup
// (web/src/lib/i18n/server-messages.ts). This test fails when a new user-facing message is added to the
// API without a translation. It reads the API sources as text, so no module outside src is compiled.
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

type Locale = 'en' | 'fr' | 'ar';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const web = require('../../web/src/lib/i18n/server-messages') as {
  SERVER_MESSAGE_KEYS: string[];
  translateServerMessage: (l: Locale, m: string) => string;
};

/** Internal codes and developer-only messages that never reach a normal user's screen. */
const INTERNAL = new Set([
  'Missing bearer token',
  'No Supabase JWT verification key configured',
  'Invalid claims',
  'Not found',
  'No JSON object found',
  'Unreadable stored login',
  'Invalid storage key',
  'Unreadable picture', // caught by the Instagram publisher and replaced by a translated message
  'Public picture storage is not configured', // guarded by InstagramPublisher.ready()
]);

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return sources(p);
    return p.endsWith('.ts') && !p.endsWith('.spec.ts') ? [p] : [];
  });
}

function staticMessages(): string[] {
  const found = new Set<string>();
  const re =
    /new \w*(?:Exception|Error)\(\s*(?:\{[^}]*?message:\s*)?(['"`])((?:(?!\1)[^\\]|\\.)*)\1/g;
  for (const file of sources(__dirname)) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(re)) {
      const raw = m[2].replace(/\\(['"`])/g, '$1');
      if (raw.includes('${')) continue; // has a changing part: covered by the patterns below
      if (/^[a-z_]+$/.test(raw) || INTERNAL.has(raw)) continue; // internal codes
      found.add(raw);
    }
  }
  return [...found];
}

describe('server error messages', () => {
  const known = new Set(web.SERVER_MESSAGE_KEYS);

  it('have a French and an Arabic translation for every user-facing API message', () => {
    const missing = staticMessages().filter((m) => !known.has(m));
    expect(missing).toEqual([]);
  });

  it('are really translated, in the right script', () => {
    const arabic = /[؀-ۿ]/;
    for (const m of web.SERVER_MESSAGE_KEYS) {
      const fr = web.translateServerMessage('fr', m);
      const ar = web.translateServerMessage('ar', m);
      expect(fr).not.toBe(m);
      expect(arabic.test(ar)).toBe(true);
    }
  });

  it('keeps English as is and leaves unknown messages untouched', () => {
    expect(web.translateServerMessage('en', 'Channel not found')).toBe('Channel not found');
    expect(web.translateServerMessage('fr', 'Something nobody translated')).toBe(
      'Something nobody translated',
    );
  });

  it('translates messages that carry a name, a number or a reason', () => {
    expect(web.translateServerMessage('fr', 'Request failed (404)')).toBe(
      'La requête a échoué (404)',
    );
    expect(web.translateServerMessage('fr', 'The channel "Main" is not connected')).toBe(
      'Le canal « Main » n’est pas connecté',
    );
    expect(
      web.translateServerMessage(
        'fr',
        'Could not connect to Facebook. Facebook could not be reached.',
      ),
    ).toBe('Connexion à Facebook impossible. Facebook est injoignable.');
    expect(
      web.translateServerMessage(
        'fr',
        'A picture (a.png) could not be prepared for Instagram. Replace it with another picture.',
      ),
    ).toMatch(/^Une image \(a\.png\) n’a pas pu être préparée/);
    expect(web.translateServerMessage('ar', 'WordPress is not available right now (503).')).toBe(
      'WordPress غير متاح حاليًا (503).',
    );
  });
});
