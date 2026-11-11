import { Prisma, Role } from '@prisma/client';
import { execSync } from 'child_process';
import { randomUUID } from 'crypto';
import { resolve } from 'path';
import { disconnectDb, prisma, resetDb } from '../helpers/db';
import { seedOrg, seedUser } from '../helpers/app';

const REPO_ROOT = resolve(__dirname, '../../../..');
const SCHEMA = 'packages/database/prisma/schema.prisma';

beforeEach(resetDb);
afterAll(disconnectDb);

describe('migrations', () => {
  it('applied every migration on a fresh database', async () => {
    const rows = await prisma().$queryRaw<{ migration_name: string; finished_at: Date | null }[]>`
      SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY migration_name`;
    expect(rows.length).toBeGreaterThanOrEqual(4);
    expect(rows.every((r) => r.finished_at !== null)).toBe(true);
  });

  it('matches the Prisma schema exactly (no drift between migrations and schema.prisma)', () => {
    // Exit code 2 means the migrated database differs from the schema; execSync throws on it.
    const out = execSync(
      `pnpm --filter @aich/database exec prisma migrate diff --from-url "${process.env.TEST_DATABASE_URL}" --to-schema-datamodel ../../${SCHEMA} --exit-code`,
      { cwd: REPO_ROOT, encoding: 'utf8', env: { ...process.env } },
    );
    expect(out).toMatch(/No difference detected/i);
  });

  it('has the foreign keys and tenant indexes the application relies on', async () => {
    const fks = await prisma().$queryRaw<{ table_name: string; foreign_table: string }[]>`
      SELECT tc.table_name, ccu.table_name AS foreign_table
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'`;
    const pairs = fks.map((f) => `${f.table_name}->${f.foreign_table}`);
    for (const table of ['Membership', 'Invitation', 'MediaAsset', 'BrandKit', 'Source']) {
      expect(pairs).toContain(`${table}->Organization`);
    }

    const indexes = await prisma().$queryRaw<{ tablename: string; indexdef: string }[]>`
      SELECT tablename, indexdef FROM pg_indexes WHERE schemaname = 'public'`;
    const has = (table: string, column: string) =>
      indexes.some((i) => i.tablename === table && i.indexdef.includes(`"${column}"`));
    for (const table of ['Membership', 'Invitation', 'MediaAsset', 'BrandKit', 'Source']) {
      expect(has(table, 'organizationId')).toBe(true);
    }
  });
});

describe('constraints and relations', () => {
  it('rejects a membership that points at a missing organization (foreign key)', async () => {
    const user = await seedUser('fk@test.dev');
    await expect(
      prisma().membership.create({
        data: { userId: user.id, organizationId: randomUUID(), role: Role.VIEWER },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('allows one membership per user per organization', async () => {
    const user = await seedUser('dup@test.dev');
    const org = await seedOrg('Dup Org', [{ userId: user.id, role: Role.OWNER }]);
    await expect(
      prisma().membership.create({
        data: { userId: user.id, organizationId: org.id, role: Role.VIEWER },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('enforces unique user email and organization slug', async () => {
    await seedUser('same@test.dev');
    await expect(seedUser('same@test.dev')).rejects.toBeInstanceOf(
      Prisma.PrismaClientKnownRequestError,
    );
    const org = await seedOrg('Slug Org');
    await expect(
      prisma().organization.create({ data: { name: 'Other', slug: org.slug } }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('enforces unique brand kit versions per organization but allows the same version elsewhere', async () => {
    const user = await seedUser('bk@test.dev');
    const a = await seedOrg('Kit A');
    const b = await seedOrg('Kit B');
    const kit = (organizationId: string, version: number) =>
      prisma().brandKit.create({ data: { organizationId, version, createdById: user.id } });
    await kit(a.id, 1);
    await expect(kit(a.id, 1)).rejects.toMatchObject({ code: 'P2002' });
    await expect(kit(b.id, 1)).resolves.toMatchObject({ version: 1 });
  });

  it('deletes an organization together with its data, and nothing else', async () => {
    const user = await seedUser('cascade@test.dev');
    const doomed = await seedOrg('Doomed', [{ userId: user.id, role: Role.OWNER }]);
    const kept = await seedOrg('Kept', [{ userId: user.id, role: Role.OWNER }]);
    for (const org of [doomed, kept]) {
      await prisma().brandKit.create({
        data: { organizationId: org.id, version: 1, createdById: user.id },
      });
      await prisma().mediaAsset.create({
        data: {
          organizationId: org.id,
          filename: 'logo.png',
          mimeType: 'image/png',
          sizeBytes: 10,
          storageKey: `${org.id}/logo.png`,
          createdById: user.id,
        },
      });
    }

    await prisma().organization.delete({ where: { id: doomed.id } });

    expect(await prisma().membership.count({ where: { organizationId: doomed.id } })).toBe(0);
    expect(await prisma().brandKit.count({ where: { organizationId: doomed.id } })).toBe(0);
    expect(await prisma().mediaAsset.count({ where: { organizationId: doomed.id } })).toBe(0);
    expect(await prisma().membership.count({ where: { organizationId: kept.id } })).toBe(1);
    expect(await prisma().brandKit.count({ where: { organizationId: kept.id } })).toBe(1);
    expect(await prisma().user.count()).toBe(1);
  });

  it('rolls back a failed transaction completely', async () => {
    const user = await seedUser('tx@test.dev');
    await expect(
      prisma().$transaction([
        prisma().organization.create({ data: { name: 'Tx Org', slug: 'tx-org' } }),
        prisma().membership.create({
          data: { userId: user.id, organizationId: randomUUID(), role: Role.OWNER },
        }),
      ]),
    ).rejects.toBeDefined();
    expect(await prisma().organization.count({ where: { slug: 'tx-org' } })).toBe(0);
  });
});
