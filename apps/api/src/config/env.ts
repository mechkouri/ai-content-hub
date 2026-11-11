import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  STORAGE_DIR: z.string().min(1).default('.storage'),
  // AI providers (server-side only). Everything here is optional; features report "not configured".
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  OPENROUTER_BASE_URL: z.string().url().default('https://openrouter.ai/api/v1'),
  OPENROUTER_DEFAULT_MODEL: z.string().min(1).default('openrouter/free'),
  CLOUDFLARE_IMAGE_WORKER_URL: z.string().url().optional(),
  CLOUDFLARE_IMAGE_WORKER_TOKEN: z.string().min(1).optional(),
  CLOUDFLARE_ACCOUNT_ID: z.string().min(1).optional(),
  CLOUDFLARE_API_TOKEN: z.string().min(1).optional(),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).default(60_000),
  AI_RETRY_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(2),
  AI_RATE_PER_MINUTE: z.coerce.number().int().min(1).default(20),
  AI_DAILY_TEXT_LIMIT: z.coerce.number().int().min(0).default(200),
  AI_MONTHLY_TEXT_LIMIT: z.coerce.number().int().min(0).default(3000),
  AI_DAILY_IMAGE_LIMIT: z.coerce.number().int().min(0).default(30),
  AI_MONTHLY_IMAGE_LIMIT: z.coerce.number().int().min(0).default(300),
  SUPABASE_JWT_SECRET: z.string().min(1).optional(),
  SUPABASE_JWKS_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  // `KEY=` lines in .env arrive as empty strings; treat them as unset.
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== ''));
  const parsed = schema.safeParse(cleaned);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`);
  }
  return parsed.data;
}
