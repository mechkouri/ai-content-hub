import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import { randomUUID } from 'crypto';
import { SignJWT } from 'jose';
import { AppModule } from '../../src/app.module';
import { prisma } from './db';

export async function createTestApp(): Promise<INestApplication> {
  // Real AppModule, real PrismaService (DATABASE_URL set by global setup), real JWT verifier.
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();
  return app;
}

/** Signs a token exactly like Supabase would (HS256, audience "authenticated"). */
export async function tokenFor(
  userId: string,
  email: string,
  opts: { secret?: string; expiresIn?: string; audience?: string } = {},
): Promise<string> {
  const secret = new TextEncoder().encode(opts.secret ?? process.env.SUPABASE_JWT_SECRET!);
  return new SignJWT({ email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setAudience(opts.audience ?? 'authenticated')
    .setIssuedAt()
    .setExpirationTime(opts.expiresIn ?? '5m')
    .sign(secret);
}

export const bearer = async (userId: string, email: string) =>
  `Bearer ${await tokenFor(userId, email)}`;

export async function seedUser(email: string) {
  return prisma().user.create({ data: { id: randomUUID(), email } });
}

export async function seedOrg(name: string, members: { userId: string; role: Role }[] = []) {
  return prisma().organization.create({
    data: {
      name,
      slug: `${name.toLowerCase().replace(/\W+/g, '-')}-${randomUUID().slice(0, 6)}`,
      memberships: { create: members },
    },
  });
}
