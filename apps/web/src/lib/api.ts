import { supabase } from './supabase';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabase().auth.getSession();
  const token = data.session?.access_token;
  const isForm = typeof FormData !== 'undefined' && init.body instanceof FormData;
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      // For FormData the browser sets the multipart boundary itself.
      ...(isForm ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const b = body as { code?: string; retryAfterSeconds?: number } | null;
    throw new ApiError(res.status, errorMessage(body, res.status), b?.code, b?.retryAfterSeconds);
  }
  return body as T;
}

/** Fetches a protected binary (e.g. an image) with the auth header and returns it as a blob. */
export async function apiBlob(path: string): Promise<Blob> {
  const { data } = await supabase().auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new ApiError(res.status, `Request failed (${res.status})`);
  return res.blob();
}

function errorMessage(body: unknown, status: number): string {
  const b = body as Record<string, unknown> | null;
  if (b && typeof b.message === 'string') return b.message;
  if (b && typeof b === 'object') {
    // Field validation errors: { field: ["message", ...] }
    const parts = Object.entries(b)
      .filter(([, v]) => Array.isArray(v))
      .map(([k, v]) => `${k}: ${(v as string[]).join(', ')}`);
    if (parts.length) return parts.join(' · ');
  }
  return `Request failed (${status})`;
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

export interface MediaAsset {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface BrandKit {
  id: string;
  version: number;
  isActive: boolean;
  label: string | null;
  description: string | null;
  websiteUrl: string | null;
  defaultLanguage: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  headingFont: string;
  bodyFont: string;
  imageStyle: string | null;
  socialUrls: Record<string, string>;
  mainLogoId: string | null;
  altLogoId: string | null;
  createdAt: string;
}

export const canWriteBrand = (role: Role | null) =>
  role === 'OWNER' || role === 'ADMIN' || role === 'DESIGNER';
export const canUploadMedia = (role: Role | null) => canWriteBrand(role) || role === 'EDITOR';
export const canDeleteMedia = canWriteBrand;

export type SourceType = 'TEXT' | 'PDF' | 'DOCX' | 'URL';
export type SourceStatus = 'TEXT_READY' | 'EXTRACTED' | 'FAILED';

export interface SourceSummary {
  id: string;
  type: SourceType;
  status: SourceStatus;
  title: string;
  language: string | null;
  classification: string | null;
  url: string | null;
  fileName: string | null;
  createdAt: string;
  extractionError: string | null;
  _count: { facts: number };
}

export interface SourceFactRow {
  id: string;
  kind: string;
  value: string;
  quote: string | null;
  verified: boolean;
  manual: boolean;
  edited: boolean;
}

export interface SourceDetail {
  source: Omit<SourceSummary, '_count'> & {
    originalText: string;
    summary: string | null;
    truncated: boolean;
    sizeBytes: number | null;
  };
  facts: SourceFactRow[];
  missing: string[];
  unverifiedCount: number;
  extraction?: { ok: boolean; code?: string; message?: string; retryable?: boolean };
}

export const FACT_KINDS = [
  'title',
  'subject',
  'organization',
  'date',
  'name',
  'requirement',
  'location',
  'contact',
  'link',
  'audience',
  'condition',
] as const;

export const FACT_LABELS: Record<string, string> = {
  title: 'Title',
  subject: 'Subject',
  organization: 'Organization',
  date: 'Dates & deadlines',
  name: 'Names',
  requirement: 'Requirements',
  location: 'Locations',
  contact: 'Contacts',
  link: 'Official links',
  audience: 'Target audience',
  condition: 'Conditions',
};

export const canWriteSources = (role: Role | null) =>
  role === 'OWNER' || role === 'ADMIN' || role === 'EDITOR' || role === 'DESIGNER';
