import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify, JWTVerifyGetKey } from 'jose';
import { loadEnv } from '../config/env';
import { AuthUser, TokenVerifier } from './auth.types';

/** Verifies Supabase-issued access tokens (HS256 shared secret or JWKS). Swappable via TOKEN_VERIFIER. */
@Injectable()
export class SupabaseTokenVerifier implements TokenVerifier {
  private readonly secret?: Uint8Array;
  private readonly jwks?: JWTVerifyGetKey;

  constructor() {
    const env = loadEnv();
    if (env.SUPABASE_JWT_SECRET) this.secret = new TextEncoder().encode(env.SUPABASE_JWT_SECRET);
    if (env.SUPABASE_JWKS_URL) this.jwks = createRemoteJWKSet(new URL(env.SUPABASE_JWKS_URL));
  }

  async verify(token: string): Promise<AuthUser> {
    try {
      const options = { audience: 'authenticated' };
      let payload;
      if (this.jwks) ({ payload } = await jwtVerify(token, this.jwks, options));
      else if (this.secret) ({ payload } = await jwtVerify(token, this.secret, options));
      else throw new Error('No Supabase JWT verification key configured');
      if (!payload.sub || typeof payload.email !== 'string') throw new Error('Invalid claims');
      return { id: payload.sub, email: payload.email.toLowerCase() };
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
