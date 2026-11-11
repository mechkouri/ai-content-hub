import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  STORAGE_DIR: z.string().min(1).default('.storage'),
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
