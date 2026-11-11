import { createHmac, randomUUID } from 'node:crypto';
import type { BrowserContext } from '@playwright/test';

export const JWT_SECRET = 'e2e-test-secret-e2e-test-secret-e2e';
export const SUPABASE_URL = 'http://localhost:54399'; // never contacted; only names the storage key
export const API_URL = 'http://localhost:4100/api';

const b64 = (v: object | Buffer) =>
  Buffer.from(v instanceof Buffer ? v : JSON.stringify(v)).toString('base64url');

/** HS256 JWT identical in shape to a Supabase access token. */
export function signToken(userId: string, email: string, ttlSeconds = 3600): string {
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64({ sub: userId, email, aud: 'authenticated', iat: now, exp: now + ttlSeconds });
  const sig = createHmac('sha256', JWT_SECRET).update(`${head}.${body}`).digest();
  return `${head}.${body}.${b64(sig)}`;
}

export interface TestUser {
  id: string;
  email: string;
}
export const newUser = (prefix = 'user'): TestUser => ({
  id: randomUUID(),
  email: `${prefix}-${randomUUID().slice(0, 8)}@e2e.test`,
});

/** Puts a valid Supabase session in localStorage, exactly where supabase-js looks for it. */
export async function signIn(context: BrowserContext, user: TestUser): Promise<void> {
  const accessToken = signToken(user.id, user.email);
  const session = {
    access_token: accessToken,
    refresh_token: 'e2e-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: {
      id: user.id,
      email: user.email,
      aud: 'authenticated',
      role: 'authenticated',
      app_metadata: {},
      user_metadata: {},
      created_at: new Date().toISOString(),
    },
  };
  await context.addInitScript(
    ([key, value]) => {
      try {
        // Seed once per browser context, so signing out in a test really stays signed out.
        if (localStorage.getItem('e2e.seeded')) return;
        localStorage.setItem('e2e.seeded', '1');
        localStorage.setItem(key, value);
      } catch {}
    },
    ['sb-localhost-auth-token', JSON.stringify(session)],
  );
}
