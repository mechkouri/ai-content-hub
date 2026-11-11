// Runs in every integration test worker before test code is imported.
process.env.NODE_ENV = 'test';
process.env.SUPABASE_JWT_SECRET = 'integration-test-secret-integration-test-secret';
// Never let tests reach paid or external services, whatever a developer's .env contains.
// Blank (not deleted) so a later .env load cannot fill them in; loadEnv() treats '' as unset.
for (const key of [
  'SUPABASE_JWKS_URL',
  'OPENROUTER_API_KEY',
  'CLOUDFLARE_IMAGE_WORKER_URL',
  'CLOUDFLARE_IMAGE_WORKER_TOKEN',
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_API_TOKEN',
]) {
  process.env[key] = '';
}
