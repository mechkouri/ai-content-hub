import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import { createHash } from 'crypto';
import request from 'supertest';
import { bearer, createTestApp, seedOrg, seedUser } from '../helpers/app';
import { disconnectDb, prisma, resetDb } from '../helpers/db';

let app: INestApplication;
beforeAll(async () => {
  app = await createTestApp();
});
afterAll(async () => {
  await app.close();
  await disconnectDb();
});
beforeEach(resetDb);

const api = () => request(app.getHttpServer());
const as = async (u: { id: string; email: string }) => bearer(u.id, u.email);

async function orgWithRoles() {
  const [owner, admin, editor, viewer] = await Promise.all([
    seedUser('owner@test.dev'),
    seedUser('admin@test.dev'),
    seedUser('editor@test.dev'),
    seedUser('viewer@test.dev'),
  ]);
  const org = await seedOrg('Acme', [
    { userId: owner.id, role: Role.OWNER },
    { userId: admin.id, role: Role.ADMIN },
    { userId: editor.id, role: Role.EDITOR },
    { userId: viewer.id, role: Role.VIEWER },
  ]);
  return { org, owner, admin, editor, viewer };
}

describe('organization permissions', () => {
  it('lets every member read the organization', async () => {
    const { org, ...users } = await orgWithRoles();
    for (const u of Object.values(users)) {
      await api()
        .get(`/api/organizations/${org.id}`)
        .set('Authorization', await as(u))
        .expect(200);
    }
  });

  it('allows only owners and admins to rename the organization', async () => {
    const { org, admin, editor, viewer } = await orgWithRoles();
    const patch = async (u: { id: string; email: string }, name: string) =>
      api()
        .patch(`/api/organizations/${org.id}`)
        .set('Authorization', await as(u))
        .send({ name });

    expect((await patch(viewer, 'Hacked')).status).toBe(403);
    expect((await patch(editor, 'Hacked')).status).toBe(403);
    expect((await prisma().organization.findUniqueOrThrow({ where: { id: org.id } })).name).toBe(
      'Acme',
    );

    expect((await patch(admin, 'Acme Renamed')).status).toBe(200);
    expect((await prisma().organization.findUniqueOrThrow({ where: { id: org.id } })).name).toBe(
      'Acme Renamed',
    );
  });

  it('allows only owners and admins to invite, and stores only a hash of the token', async () => {
    const { org, admin, editor } = await orgWithRoles();
    const invite = async (u: { id: string; email: string }, role: Role) =>
      api()
        .post(`/api/organizations/${org.id}/invitations`)
        .set('Authorization', await as(u))
        .send({ email: 'New.Person@Test.dev', role });

    expect((await invite(editor, Role.VIEWER)).status).toBe(403);
    expect(await prisma().invitation.count()).toBe(0);

    const res = await invite(admin, Role.EDITOR);
    expect(res.status).toBe(201);
    const stored = await prisma().invitation.findFirstOrThrow({
      where: { organizationId: org.id },
    });
    expect(stored.email).toBe('new.person@test.dev');
    expect(stored.tokenHash).toBe(createHash('sha256').update(res.body.token).digest('hex'));
    expect(stored.tokenHash).not.toBe(res.body.token);
  });

  it('prevents admins from granting the OWNER role', async () => {
    const { org, admin } = await orgWithRoles();
    await api()
      .post(`/api/organizations/${org.id}/invitations`)
      .set('Authorization', await as(admin))
      .send({ email: 'boss@test.dev', role: Role.OWNER })
      .expect(403);
    expect(await prisma().invitation.count()).toBe(0);
  });

  it('prevents admins from changing or removing an owner', async () => {
    const { org, admin, owner } = await orgWithRoles();
    await api()
      .patch(`/api/organizations/${org.id}/members/${owner.id}`)
      .set('Authorization', await as(admin))
      .send({ role: Role.VIEWER })
      .expect(403);
    await api()
      .delete(`/api/organizations/${org.id}/members/${owner.id}`)
      .set('Authorization', await as(admin))
      .expect(403);
    const m = await prisma().membership.findFirstOrThrow({
      where: { userId: owner.id, organizationId: org.id },
    });
    expect(m.role).toBe(Role.OWNER);
  });

  it('accepts an invitation only for the invited email, exactly once', async () => {
    const { org, admin } = await orgWithRoles();
    const res = await api()
      .post(`/api/organizations/${org.id}/invitations`)
      .set('Authorization', await as(admin))
      .send({ email: 'guest@test.dev', role: Role.EDITOR })
      .expect(201);

    const stranger = await seedUser('stranger@test.dev');
    await api()
      .post('/api/invitations/accept')
      .set('Authorization', await as(stranger))
      .send({ token: res.body.token })
      .expect(403);

    const guest = await seedUser('guest@test.dev');
    await api()
      .post('/api/invitations/accept')
      .set('Authorization', await as(guest))
      .send({ token: res.body.token })
      .expect((r) => expect([200, 201]).toContain(r.status));
    expect(
      await prisma().membership.findFirst({
        where: { userId: guest.id, organizationId: org.id },
      }),
    ).toMatchObject({ role: Role.EDITOR });

    await api()
      .post('/api/invitations/accept')
      .set('Authorization', await as(guest))
      .send({ token: res.body.token })
      .expect(400);
  });
});

describe('cross-tenant data isolation', () => {
  async function twoTenants() {
    const alice = await seedUser('alice@test.dev');
    const bob = await seedUser('bob@test.dev');
    const orgA = await seedOrg('Tenant A', [{ userId: alice.id, role: Role.OWNER }]);
    const orgB = await seedOrg('Tenant B', [{ userId: bob.id, role: Role.OWNER }]);
    const kitA = await prisma().brandKit.create({
      data: { organizationId: orgA.id, version: 1, label: 'A secret kit', createdById: alice.id },
    });
    await prisma().brandKit.create({
      data: { organizationId: orgB.id, version: 1, label: 'B kit', createdById: bob.id },
    });
    return { alice, bob, orgA, orgB, kitA };
  }

  it("hides another tenant's organization, members, brand kits and media with 404", async () => {
    const { bob, orgA } = await twoTenants();
    const auth = await as(bob);
    for (const path of ['', '/members', '/brand-kits', '/brand-kits/active', '/media']) {
      const res = await api()
        .get(`/api/organizations/${orgA.id}${path}`)
        .set('Authorization', auth);
      expect({ path, status: res.status }).toEqual({ path, status: 404 });
      expect(JSON.stringify(res.body)).not.toContain('A secret kit');
    }
  });

  it("cannot write to another tenant's organization", async () => {
    const { bob, orgA } = await twoTenants();
    const auth = await as(bob);
    await api()
      .patch(`/api/organizations/${orgA.id}`)
      .set('Authorization', auth)
      .send({ name: 'Pwned' })
      .expect(404);
    await api()
      .post(`/api/organizations/${orgA.id}/invitations`)
      .set('Authorization', auth)
      .send({ email: 'x@test.dev', role: Role.VIEWER })
      .expect(404);
    await api()
      .post(`/api/organizations/${orgA.id}/brand-kits`)
      .set('Authorization', auth)
      .send({})
      .expect(404);

    expect((await prisma().organization.findUniqueOrThrow({ where: { id: orgA.id } })).name).toBe(
      'Tenant A',
    );
    expect(await prisma().invitation.count()).toBe(0);
    expect(await prisma().brandKit.count({ where: { organizationId: orgA.id } })).toBe(1);
  });

  it('lists only the organizations the caller belongs to', async () => {
    const { alice, orgA } = await twoTenants();
    const res = await api()
      .get('/api/organizations')
      .set('Authorization', await as(alice))
      .expect(200);
    expect(res.body.map((m: { organizationId: string }) => m.organizationId)).toEqual([orgA.id]);
  });

  it("cannot activate another tenant's brand kit through your own organization path", async () => {
    const { bob, orgB, kitA } = await twoTenants();
    await api()
      .post(`/api/organizations/${orgB.id}/brand-kits/${kitA.id}/activate`)
      .set('Authorization', await as(bob))
      .expect(404);
    expect((await prisma().brandKit.findUniqueOrThrow({ where: { id: kitA.id } })).isActive).toBe(
      false,
    );
  });

  it('keeps the same user scoped per organization when they belong to both', async () => {
    const { alice, orgA, orgB } = await twoTenants();
    await prisma().membership.create({
      data: { userId: alice.id, organizationId: orgB.id, role: Role.VIEWER },
    });
    const auth = await as(alice);
    const kitsA = await api()
      .get(`/api/organizations/${orgA.id}/brand-kits`)
      .set('Authorization', auth)
      .expect(200);
    const kitsB = await api()
      .get(`/api/organizations/${orgB.id}/brand-kits`)
      .set('Authorization', auth)
      .expect(200);
    expect(kitsA.body.map((k: { label: string }) => k.label)).toEqual(['A secret kit']);
    expect(kitsB.body.map((k: { label: string }) => k.label)).toEqual(['B kit']);
    // Per-organization role: owner in A, only viewer in B.
    await api()
      .patch(`/api/organizations/${orgA.id}`)
      .set('Authorization', auth)
      .send({ name: 'Tenant A v2' })
      .expect(200);
    await api()
      .patch(`/api/organizations/${orgB.id}`)
      .set('Authorization', auth)
      .send({ name: 'Nope' })
      .expect(403);
  });
});

describe('API validation', () => {
  const create = async (body: unknown) => {
    const u = await seedUser(`v${Math.random().toString(36).slice(2)}@test.dev`);
    return api()
      .post('/api/organizations')
      .set('Authorization', await as(u))
      .send(body as object);
  };

  it.each([
    ['too short name', { name: 'A' }],
    ['missing name', {}],
    ['name that is not a string', { name: 42 }],
    ['name too long', { name: 'x'.repeat(101) }],
    ['unsupported language', { name: 'Valid Name', defaultLanguage: 'de' }],
  ])('rejects %s with 400 and creates nothing', async (_label, body) => {
    const res = await create(body);
    expect(res.status).toBe(400);
    expect(await prisma().organization.count()).toBe(0);
  });

  it('creates an organization with the creator as OWNER, trimming the name', async () => {
    const u = await seedUser('creator@test.dev');
    const res = await api()
      .post('/api/organizations')
      .set('Authorization', await as(u))
      .send({ name: '  Fresh Org  ', defaultLanguage: 'fr' })
      .expect(201);
    expect(res.body).toMatchObject({ name: 'Fresh Org', defaultLanguage: 'fr' });
    expect(res.body.slug).toMatch(/^fresh-org-[0-9a-f]{6}$/);
    expect(
      await prisma().membership.findFirstOrThrow({ where: { organizationId: res.body.id } }),
    ).toMatchObject({ userId: u.id, role: Role.OWNER });
  });

  it('rejects invalid invitation payloads and malformed identifiers', async () => {
    const { org, owner } = await orgWithRoles();
    const auth = await as(owner);
    const invite = (body: object) =>
      api().post(`/api/organizations/${org.id}/invitations`).set('Authorization', auth).send(body);
    expect((await invite({ email: 'not-an-email', role: 'VIEWER' })).status).toBe(400);
    expect((await invite({ email: 'ok@test.dev', role: 'SUPERUSER' })).status).toBe(400);
    expect((await invite({})).status).toBe(400);
    expect(await prisma().invitation.count()).toBe(0);
    await api().get('/api/organizations/not-a-uuid').set('Authorization', auth).expect(404);
  });
});
