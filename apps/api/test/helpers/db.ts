import { PrismaClient } from '@prisma/client';

let client: PrismaClient | undefined;

export function prisma(): PrismaClient {
  client ??= new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
  return client;
}

/** Empties every application table (keeps the migrations table). */
export async function resetDb(): Promise<void> {
  const db = prisma();
  const rows = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (rows.length === 0) return;
  const list = rows.map((r) => `"public"."${r.tablename}"`).join(', ');
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

export async function disconnectDb(): Promise<void> {
  await client?.$disconnect();
  client = undefined;
}
