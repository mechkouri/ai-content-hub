import { supabase } from './supabase';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabase().auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = typeof body?.message === 'string' ? body.message : `Request failed (${res.status})`;
    throw new ApiError(res.status, msg);
  }
  return body as T;
}

export type Role = 'OWNER' | 'ADMIN' | 'EDITOR' | 'DESIGNER' | 'APPROVER' | 'PUBLISHER' | 'VIEWER';

export const ROLES: Role[] = [
  'OWNER',
  'ADMIN',
  'EDITOR',
  'DESIGNER',
  'APPROVER',
  'PUBLISHER',
  'VIEWER',
];

export interface Organization {
  id: string;
  name: string;
  slug: string;
  defaultLanguage: string;
}
export interface MembershipWithOrg {
  id: string;
  role: Role;
  organizationId: string;
  organization: Organization;
}
export interface MemberRow {
  id: string;
  userId: string;
  role: Role;
  user: { id: string; email: string; name: string | null };
}
