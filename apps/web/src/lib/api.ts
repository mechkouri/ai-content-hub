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

export interface AiStatus {
  providers: {
    text: { id: string; configured: boolean }[];
    image: { id: string; configured: boolean }[];
  };
  textModel: string;
  freeOnly: boolean;
  usage: { text: { today: number; month: number }; image: { today: number; month: number } };
  limits: { dailyText: number; monthlyText: number; dailyImage: number; monthlyImage: number };
  settings: {
    textModel: string | null;
    dailyTextLimit: number | null;
    monthlyTextLimit: number | null;
    dailyImageLimit: number | null;
    monthlyImageLimit: number | null;
  } | null;
}
export interface FreeModel {
  id: string;
  name: string;
  contextLength: number;
  supportsJson: boolean;
}
export const canUseAi = (role: Role | null) =>
  role === 'OWNER' || role === 'ADMIN' || role === 'EDITOR' || role === 'DESIGNER';
export const canAdminAi = (role: Role | null) => role === 'OWNER' || role === 'ADMIN';

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

// ---------- content studio ----------

export type ContentKind = 'ARTICLE' | 'INSTAGRAM' | 'FACEBOOK' | 'LINKEDIN';
export type ContentStatus = 'DRAFT' | 'NEEDS_REVIEW';
export type Lang = 'fr' | 'ar' | 'en';

export const CONTENT_KINDS: { id: ContentKind; label: string; icon: string; blurb: string }[] = [
  {
    id: 'ARTICLE',
    label: 'Website article',
    icon: '📰',
    blurb: 'SEO-ready article with title, meta description, headings and FAQ',
  },
  {
    id: 'INSTAGRAM',
    label: 'Instagram',
    icon: '📸',
    blurb: 'Caption, carousel slides, hashtags and a call to action',
  },
  {
    id: 'FACEBOOK',
    label: 'Facebook',
    icon: '👍',
    blurb: 'Conversational post with optional link and images',
  },
  {
    id: 'LINKEDIN',
    label: 'LinkedIn',
    icon: '💼',
    blurb: 'Professional announcement, text or image post',
  },
];

export const LANG_LABELS: Record<string, string> = { fr: 'Français', ar: 'العربية', en: 'English' };

export interface ClaimWarning {
  type: 'number' | 'url' | 'email';
  value: string;
  message: string;
}
export interface SeoCheck {
  id: string;
  ok: boolean;
  message: string;
}

export interface ImageIdea {
  brief: string;
  altText: string;
}
export interface ArticleContent {
  seoTitle: string;
  metaDescription: string;
  slug: string;
  h1: string;
  excerpt: string;
  introduction: string;
  sections: { heading: string; body: string; subsections?: { heading: string; body: string }[] }[];
  conclusion: string;
  faq: { question: string; answer: string }[];
  internalLinkSuggestions: { anchorText: string; suggestedTopic: string }[];
  featuredImageBrief: string;
  imageAltText: string;
  structuredData: { type: string; notes?: string };
}
export interface InstagramContent {
  caption: string;
  carousel: { headline: string; body: string }[];
  hashtags: string[];
  cta: string;
  imageBrief: string;
  altText: string;
}
export interface FacebookContent {
  postText: string;
  cta: string;
  link?: string | null;
  images: ImageIdea[];
  hashtags: string[];
}
export interface LinkedinContent {
  postText: string;
  cta: string;
  imageMode: 'text' | 'image' | 'multi_image';
  images: ImageIdea[];
  hashtags: string[];
}
export type AnyContent = ArticleContent | InstagramContent | FacebookContent | LinkedinContent;

export interface ContentSummary {
  id: string;
  sourceId: string;
  kind: ContentKind;
  status: ContentStatus;
  language: string;
  title: string;
  edited: boolean;
  translatedFromId: string | null;
  warnings: ClaimWarning[];
  createdAt: string;
}
export interface ContentPiece extends Omit<ContentSummary, 'warnings'> {
  warnings: ClaimWarning[];
  content: AnyContent;
  options: Record<string, unknown>;
  usedFactIds: string[];
  model: string | null;
  provider: string | null;
  updatedAt: string;
}
export interface ContentDetail {
  piece: ContentPiece;
  seoChecks?: SeoCheck[];
  source?: { id: string; title: string } | null;
  factsAvailable?: number;
  excludedUnverified?: number;
}

export interface GenerateOptions {
  language?: Lang;
  style: string;
  tone: string;
  audience?: string;
  length: 'short' | 'medium' | 'long';
  primaryKeyword?: string;
  instructions?: string;
}

export const STYLE_OPTIONS = [
  'informative',
  'journalistic',
  'storytelling',
  'promotional',
  'formal',
  'conversational',
];
export const TONE_OPTIONS = ['professional', 'friendly', 'inspiring', 'urgent', 'neutral'];

export const canWriteContent = (role: Role | null) =>
  role === 'OWNER' || role === 'ADMIN' || role === 'EDITOR' || role === 'DESIGNER';
