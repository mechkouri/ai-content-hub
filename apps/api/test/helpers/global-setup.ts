import { execSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import EmbeddedPostgres from 'embedded-postgres';

const REPO_ROOT = resolve(__dirname, '../../../..');
const PORT = Number(process.env.TEST_PG_PORT ?? 54329);

/** Refuse anything that could be a real database. */
export function assertSafeTestUrl(url: string): void {
  const u = new URL(url);
  const local = ['localhost', '127.0.0.1', '::1', '[::1]', 'postgres'].includes(u.hostname);
  const dbName = u.pathname.replace(/^\//, '');
  if (!local || !/test/i.test(dbName)) {
    throw new Error(
      `Refusing to run integration tests against "${u.hostname}/${dbName}": ` +
        'the host must be local and the database name must contain "test".',
    );
  }
}

function migrate(url: string): void {
  execSync('pnpm --filter @aich/database exec prisma migrate deploy', {
    cwd: REPO_ROOT,
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
  });
}

export default async function setup(): Promise<() => Promise<void>> {
  let pg: EmbeddedPostgres | undefined;
  let dir: string | undefined;
  let url = process.env.TEST_DATABASE_URL;

  if (!url) {
    // Local default: a throwaway PostgreSQL started by this process (no Docker needed).
    dir = mkdtempSync(join(tmpdir(), 'aich-test-pg-'));
    pg = new EmbeddedPostgres({
      databaseDir: dir,
      user: 'postgres',
      password: 'postgres',
      port: PORT,
      persistent: false,
    });
    await pg.initialise();
    await pg.start();
    await pg.createDatabase('aich_test');
    url = `postgresql://postgres:postgres@127.0.0.1:${PORT}/aich_test`;
  }

  assertSafeTestUrl(url);
  process.env.TEST_DATABASE_URL = url;
  process.env.DATABASE_URL = url;
  process.env.DIRECT_URL = url;
  migrate(url);

  return async () => {
    if (pg) await pg.stop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  };
}
