import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import { SignJWT } from 'jose';
import request from 'supertest';
import { AppModule } from '../app.module';
import { TOKEN_VERIFIER } from '../auth/auth.types';
import { canAssignRole, canModifyMember, hasPermission } from '../auth/permissions';
import { SupabaseTokenVerifier } from '../auth/supabase-token.verifier';
import { PrismaService } from '../prisma/prisma.service';
import { hashToken } from './invitations.service';

const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';
const U_OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const U_ADMIN = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const U_VIEWER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

type M = { id: string; userId: string; organizationId: string; role: Role };
let memberships: M[];
let invitations: any[];

const prismaMock = {
  user: { upsert: jest.fn().mockResolvedValue({}) },
  membership: {
    findUnique: jest.fn(async ({ where }: any) => {
      const k = where.userId_organizationId;
      return (
        memberships.find((m) => m.userId === k.userId && m.organizationId === k.organizationId) ??
        null
      );
    }),
    count: jest.fn(
      async ({ where }: any) =>
        memberships.filter(
          (m) => m.organizationId === where.organizationId && m.role === where.role,
        ).length,
    ),
    update: jest.fn(async ({ where, data }: any) => {
      const m = memberships.find((x) => x.id === where.id)!;
      m.role = data.role;
      return m;
    }),
    delete: jest.fn(async ({ where }: any) => {
      memberships = memberships.filter((m) => m.id !== where.id);
    }),
    upsert: jest.fn(async ({ create }: any) => ({ id: 'new', ...create })),
    findMany: jest.fn(async () => []),
  },
  invitation: {
    create: jest.fn(async ({ data }: any) => ({ id: 'inv1', ...data })),
    findUnique: jest.fn(
      async ({ where }: any) => invitations.find((i) => i.tokenHash === where.tokenHash) ?? null,
    ),
    update: jest.fn(async () => ({})),
  },
  organization: { findUnique: jest.fn(async ({ where }: any) => ({ id: where.id, name: 'Org' })) },
  $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
};

// Test tokens are "user:<id>:<email>"; the real verifier is covered separately below.
const fakeVerifier = {
  verify: async (t: string) => {
    const [, id, email] = t.split(':');
    if (!id) throw new Error('bad');
    return { id, email };
  },
};
const as = (id: string, email = `${id}@x.test`) => `Bearer user:${id}:${email}`;

describe('organizations & tenant isolation', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(TOKEN_VERIFIER)
      .useValue({
        verify: async (t: string) => {
          if (!t.startsWith('user:')) {
            const { UnauthorizedException } = await import('@nestjs/common');
            throw new UnauthorizedException();
          }
          return fakeVerifier.verify(t);
        },
      })
      .compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });
  afterAll(() => app.close());

  beforeEach(() => {
    memberships = [
      { id: 'm1', userId: U_OWNER, organizationId: ORG_A, role: Role.OWNER },
      { id: 'm2', userId: U_ADMIN, organizationId: ORG_A, role: Role.ADMIN },
      { id: 'm3', userId: U_VIEWER, organizationId: ORG_A, role: Role.VIEWER },
      { id: 'm4', userId: U_OWNER, organizationId: ORG_B, role: Role.OWNER },
    ];
    invitations = [];
  });

  it('rejects requests without a valid token (401)', async () => {
    await request(app.getHttpServer()).get('/api/me').expect(401);
    await request(app.getHttpServer())
      .get('/api/me')
      .set('Authorization', 'Bearer junk')
      .expect(401);
  });

  it('lets a member read their organization', async () => {
    await request(app.getHttpServer())
      .get(`/api/organizations/${ORG_A}`)
      .set('Authorization', as(U_VIEWER))
      .expect(200);
  });

  it('hides organizations from non-members (cross-org access returns 404)', async () => {
    // viewer belongs only to ORG_A
    await request(app.getHttpServer())
      .get(`/api/organizations/${ORG_B}`)
      .set('Authorization', as(U_VIEWER))
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/organizations/${ORG_B}/members`)
      .set('Authorization', as(U_VIEWER))
      .expect(404);
    await request(app.getHttpServer())
      .post(`/api/organizations/${ORG_B}/invitations`)
      .set('Authorization', as(U_VIEWER))
      .send({ email: 'a@b.co', role: 'VIEWER' })
      .expect(404);
  });

  it('rejects malformed organization ids', async () => {
    await request(app.getHttpServer())
      .get('/api/organizations/not-a-uuid')
      .set('Authorization', as(U_OWNER))
      .expect(404);
  });

  it('forbids a viewer from inviting (403)', async () => {
    await request(app.getHttpServer())
      .post(`/api/organizations/${ORG_A}/invitations`)
      .set('Authorization', as(U_VIEWER))
      .send({ email: 'new@x.test', role: 'EDITOR' })
      .expect(403);
  });

  it('stops an admin from inviting an owner, allows an owner', async () => {
    const url = `/api/organizations/${ORG_A}/invitations`;
    const body = { email: 'new@x.test', role: 'OWNER' };
    await request(app.getHttpServer())
      .post(url)
      .set('Authorization', as(U_ADMIN))
      .send(body)
      .expect(403);
    const res = await request(app.getHttpServer())
      .post(url)
      .set('Authorization', as(U_OWNER))
      .send(body)
      .expect(201);
    expect(res.body.token).toHaveLength(64);
  });

  it('validates request bodies (400)', async () => {
    await request(app.getHttpServer())
      .post('/api/organizations')
      .set('Authorization', as(U_OWNER))
      .send({ name: '' })
      .expect(400);
  });

  it('protects the last owner from demotion and removal', async () => {
    // ORG_A has a single owner
    await request(app.getHttpServer())
      .patch(`/api/organizations/${ORG_A}/members/${U_OWNER}`)
      .set('Authorization', as(U_OWNER))
      .send({ role: 'ADMIN' })
      .expect(403);
    await request(app.getHttpServer())
      .delete(`/api/organizations/${ORG_A}/members/${U_OWNER}`)
      .set('Authorization', as(U_OWNER))
      .expect(403);
  });

  it('prevents an admin from modifying an owner', async () => {
    await request(app.getHttpServer())
      .patch(`/api/organizations/${ORG_A}/members/${U_OWNER}`)
      .set('Authorization', as(U_ADMIN))
      .send({ role: 'VIEWER' })
      .expect(403);
  });

  it('accepts an invitation only for the invited email', async () => {
    const token = 'f'.repeat(64);
    invitations = [
      {
        id: 'inv1',
        organizationId: ORG_B,
        email: 'invited@x.test',
        role: Role.EDITOR,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 60_000),
        acceptedAt: null,
      },
    ];
    await request(app.getHttpServer())
      .post('/api/invitations/accept')
      .set('Authorization', as(U_VIEWER, 'other@x.test'))
      .send({ token })
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/invitations/accept')
      .set('Authorization', as(U_VIEWER, 'invited@x.test'))
      .send({ token })
      .expect(201);
  });

  it('rejects expired invitations', async () => {
    const token = 'e'.repeat(64);
    invitations = [
      {
        id: 'inv2',
        organizationId: ORG_B,
        email: 'invited@x.test',
        role: Role.EDITOR,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() - 1000),
        acceptedAt: null,
      },
    ];
    await request(app.getHttpServer())
      .post('/api/invitations/accept')
      .set('Authorization', as(U_VIEWER, 'invited@x.test'))
      .send({ token })
      .expect(400);
  });
});

describe('permissions', () => {
  it('limits management actions to owners and admins', () => {
    expect(hasPermission(Role.ADMIN, 'members:invite')).toBe(true);
    expect(hasPermission(Role.EDITOR, 'members:invite')).toBe(false);
    expect(hasPermission(Role.VIEWER, 'org:read')).toBe(true);
  });
  it('restricts owner role changes to owners', () => {
    expect(canAssignRole(Role.ADMIN, Role.OWNER)).toBe(false);
    expect(canAssignRole(Role.OWNER, Role.OWNER)).toBe(true);
    expect(canModifyMember(Role.ADMIN, Role.OWNER)).toBe(false);
    expect(canModifyMember(Role.EDITOR, Role.VIEWER)).toBe(false);
  });
});

describe('SupabaseTokenVerifier', () => {
  const secret = 'test-secret-test-secret-test-secret-123';
  const OLD = process.env.SUPABASE_JWT_SECRET;
  beforeAll(() => (process.env.SUPABASE_JWT_SECRET = secret));
  afterAll(() => {
    if (OLD === undefined) delete process.env.SUPABASE_JWT_SECRET;
    else process.env.SUPABASE_JWT_SECRET = OLD;
  });

  const sign = (claims: object, exp = '1h', key = secret) =>
    new SignJWT(claims as any)
      .setProtectedHeader({ alg: 'HS256' })
      .setAudience('authenticated')
      .setExpirationTime(exp)
      .sign(new TextEncoder().encode(key));

  it('accepts a valid token', async () => {
    const v = new SupabaseTokenVerifier();
    const user = await v.verify(await sign({ sub: U_OWNER, email: 'Owner@X.test' }));
    expect(user).toEqual({ id: U_OWNER, email: 'owner@x.test' });
  });
  it('rejects wrong signature and expired tokens', async () => {
    const v = new SupabaseTokenVerifier();
    await expect(
      v.verify(await sign({ sub: U_OWNER, email: 'a@b.co' }, '1h', 'x'.repeat(40))),
    ).rejects.toThrow();
    await expect(v.verify(await sign({ sub: U_OWNER, email: 'a@b.co' }, '-1h'))).rejects.toThrow();
  });
});
