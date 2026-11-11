import { Membership } from '@prisma/client';
import type { Request } from 'express';

export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthenticatedRequest extends Request {
  user: AuthUser;
  membership?: Membership;
}

export interface TokenVerifier {
  verify(token: string): Promise<AuthUser>;
}

export const TOKEN_VERIFIER = Symbol('TOKEN_VERIFIER');
