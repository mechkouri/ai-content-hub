// Starts the backend the E2E tests run against: a PostgreSQL test database (embedded locally,
// TEST_DATABASE_URL in CI), applies the real migrations, then runs the real NestJS API.
import { execSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

const root = resolve(import.meta.dirname, '../../..');
const API_PORT = process.env.E2E_API_PORT ?? '4100';
const PG_PORT = Number(process.env.E2E_PG_PORT ?? 54330);
const JWT_SECRET = process.env.E2E_JWT_SECRET;

let pg;
let dir;
let url = process.env.TEST_DATABASE_URL;
if (!url) {
  dir = mkdtempSync(join(tmpdir(), 'aich-e2e-pg-'));
  pg = new EmbeddedPostgres({
    databaseDir: dir,
    user: 'postgres',
    password: 'postgres',
    port: PG_PORT,
    persistent: false,
    onLog: () => {},
    onError: () => {},
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('aich_e2e_test');
  url = `postgresql://postgres:postgres@127.0.0.1:${PG_PORT}/aich_e2e_test`;
}
if (pg) {
  // Playwright force-kills this process on Windows, so no exit handler can be relied on.
  // A detached watcher removes the database once this process is gone.
  const watcher = `
    const { execSync } = require('node:child_process');
    const { readFileSync, rmSync } = require('node:fs');
    const [parent, dir] = process.argv.slice(1);
    const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
    const timer = setInterval(() => {
      if (alive(Number(parent))) return;
      clearInterval(timer);
      try {
        const pid = readFileSync(dir + '/postmaster.pid', 'utf8').split('\n')[0];
        if (process.platform === 'win32') execSync('taskkill /pid ' + pid + ' /t /f', { stdio: 'ignore' });
        else process.kill(Number(pid), 'SIGTERM');
      } catch {}
      setTimeout(() => { try { rmSync(dir, { recursive: true, force: true }); } catch {} process.exit(0); }, 3000);
    }, 1000);
  `;
  spawn(process.execPath, ['-e', watcher, String(process.pid), dir], {
    detached: true,
    stdio: 'ignore',
  }).unref();
}
const host = new URL(url).hostname;
if (!['localhost', '127.0.0.1'].includes(host) || !/test/i.test(new URL(url).pathname)) {
  throw new Error('Refusing to run E2E against a non-local or non-test database');
}

const env = {
  ...process.env,
  NODE_ENV: 'test',
  DATABASE_URL: url,
  DIRECT_URL: url,
  API_PORT,
  WEB_ORIGIN: process.env.E2E_WEB_ORIGIN ?? 'http://localhost:3100',
  SUPABASE_JWT_SECRET: JWT_SECRET,
  STORAGE_DIR: join(tmpdir(), 'aich-e2e-storage'),
};
// main.ts loads the repo-root .env, but dotenv never overrides variables that already exist.
// Blank everything that could point the API at a real service so the E2E run is hermetic.
for (const k of [
  'SUPABASE_JWKS_URL',
  'OPENROUTER_API_KEY',
  'CLOUDFLARE_IMAGE_WORKER_URL',
  'CLOUDFLARE_IMAGE_WORKER_TOKEN',
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_API_TOKEN',
]) {
  env[k] = '';
}

execSync('pnpm --filter @aich/database exec prisma migrate deploy', {
  cwd: root,
  env,
  stdio: 'inherit',
});

const api = spawn(
  'pnpm',
  ['--filter', '@aich/api', 'exec', 'ts-node-dev', '--transpile-only', 'src/main.ts'],
  {
    cwd: root,
    env,
    stdio: 'inherit',
    shell: true,
  },
);

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  try {
    if (process.platform === 'win32')
      execSync(`taskkill /pid ${api.pid} /t /f`, { stdio: 'ignore' });
    else api.kill('SIGTERM');
  } catch {}
  if (pg) await pg.stop().catch(() => {});
  if (dir) rmSync(dir, { recursive: true, force: true });
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
api.on('exit', stop);
