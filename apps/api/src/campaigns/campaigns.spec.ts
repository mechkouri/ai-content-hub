import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { AppModule } from '../app.module';
import { TOKEN_VERIFIER } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';

const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';
const U_EDITOR = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const U_VIEWER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const U_APPROVER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const U_OTHER = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

let campaigns: any[];
let pieces: any[];
let memberships: { userId: string; organizationId: string; role: Role }[];

const prismaMock: any = {
  user: { upsert: jest.fn().mockResolvedValue({}) },
  membership: {
    findUnique: jest.fn(async ({ where }: any) => {
      const k = where.userId_organizationId;
      const m = memberships.find(
        (x) => x.userId === k.userId && x.organizationId === k.organizationId,
      );
      return m ? { id: 'm', ...m } : null;
    }),
  },
  campaign: {
    create: jest.fn(async ({ data }: any) => {
      const c = {
        id: randomUUID(),
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      };
      campaigns.push(c);
      return c;
    }),
    findFirst: jest.fn(
      async ({ where }: any) =>
        campaigns.find((c) => c.id === where.id && c.organizationId === where.organizationId) ??
        null,
    ),
    findMany: jest.fn(async ({ where }: any) =>
      campaigns
        .filter(
          (c) =>
            c.organizationId === where.organizationId &&
            (!where.status || c.status === where.status),
        )
        .map((c) => ({ ...c, pieces: pieces.filter((p) => p.campaignId === c.id) })),
    ),
    update: jest.fn(async ({ where, data }: any) =>
      Object.assign(
        campaigns.find((c) => c.id === where.id),
        data,
      ),
    ),
    delete: jest.fn(async ({ where }: any) => {
      campaigns = campaigns.filter((c) => c.id !== where.id);
      // The database sets the reference to null; mirror that.
      pieces.forEach((p) => p.campaignId === where.id && (p.campaignId = null));
    }),
  },
  contentPiece: {
    findMany: jest.fn(async ({ where }: any) =>
      pieces.filter(
        (p) =>
          p.organizationId === where.organizationId &&
          (!where.id || where.id.in.includes(p.id)) &&
          (!where.campaignId || p.campaignId === where.campaignId),
      ),
    ),
    updateMany: jest.fn(async ({ where, data }: any) => {
      const hit = pieces.filter(
        (p) =>
          p.organizationId === where.organizationId &&
          (typeof where.id === 'string' ? p.id === where.id : where.id.in.includes(p.id)) &&
          (where.campaignId === undefined || p.campaignId === where.campaignId),
      );
      hit.forEach((p) => Object.assign(p, data));
      return { count: hit.length };
    }),
  },
};

describe('campaigns API', () => {
  let app: INestApplication;
  const as = (id: string) => `Bearer user:${id}`;
  const base = `/api/organizations/${ORG_A}/campaigns`;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(TOKEN_VERIFIER)
      .useValue({
        verify: async (t: string) => {
          if (!t.startsWith('user:')) throw new UnauthorizedException();
          return { id: t.split(':')[1], email: 'x@x.test' };
        },
      })
      .compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });
  afterAll(() => app.close());

  const piece = (over: Record<string, unknown> = {}) => {
    const p = {
      id: randomUUID(),
      organizationId: ORG_A,
      campaignId: null,
      kind: 'ARTICLE',
      title: 'A piece',
      language: 'en',
      status: 'DRAFT',
      approvalStatus: 'DRAFT',
      scheduledFor: null,
      createdAt: new Date(),
      ...over,
    };
    pieces.push(p);
    return p;
  };

  beforeEach(() => {
    campaigns = [];
    pieces = [];
    memberships = [
      { userId: U_EDITOR, organizationId: ORG_A, role: Role.EDITOR },
      { userId: U_VIEWER, organizationId: ORG_A, role: Role.VIEWER },
      { userId: U_APPROVER, organizationId: ORG_A, role: Role.APPROVER },
      { userId: U_OTHER, organizationId: ORG_B, role: Role.OWNER },
    ];
  });

  const create = (body: object, user = U_EDITOR) =>
    request(app.getHttpServer()).post(base).set('Authorization', as(user)).send(body);

  it('creates, lists and reads a campaign with its progress', async () => {
    const res = await create({
      name: '  Open Day 2027 ',
      description: 'Spring recruitment',
      startsOn: '2027-03-01',
      endsOn: '2027-03-14',
    }).expect(201);
    expect(res.body.name).toBe('Open Day 2027'); // trimmed
    expect(res.body.startsOn).toBe('2027-03-01T00:00:00.000Z');
    const id = res.body.id;

    const a = piece({ approvalStatus: 'APPROVED', scheduledFor: new Date() });
    const b = piece({ approvalStatus: 'IN_REVIEW' });
    const c = piece({ approvalStatus: 'CHANGES_REQUESTED' });
    piece(); // not in the campaign
    await request(app.getHttpServer())
      .post(`${base}/${id}/content`)
      .set('Authorization', as(U_EDITOR))
      .send({ contentIds: [a.id, b.id, c.id, a.id] }) // a duplicate id is harmless
      .expect(201);

    const detail = await request(app.getHttpServer())
      .get(`${base}/${id}`)
      .set('Authorization', as(U_VIEWER))
      .expect(200);
    expect(detail.body.pieces).toHaveLength(3);
    expect(detail.body.stats).toEqual({
      total: 3,
      draft: 1,
      inReview: 1,
      approved: 1,
      scheduled: 1,
    });

    const list = await request(app.getHttpServer())
      .get(base)
      .set('Authorization', as(U_VIEWER))
      .expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].stats.total).toBe(3);
    expect(list.body[0]).not.toHaveProperty('pieces');
  });

  it('validates input', async () => {
    await create({}).expect(400);
    await create({ name: 'x' }).expect(400);
    await create({ name: 'Valid name', startsOn: '14/03/2027' }).expect(400);
    await create({ name: 'Valid name', startsOn: '2027-02-31' }).expect(400);
    await create({ name: 'Valid name', startsOn: '2027-03-14', endsOn: '2027-03-01' }).expect(400);
    await create({ name: 'Valid name', startsOn: '2027-03-14', endsOn: '2027-03-14' }).expect(201);
  });

  it('updates, archives, and checks the date order against the stored dates', async () => {
    const { body } = await create({ name: 'Spring', startsOn: '2027-03-10' }).expect(201);
    const patch = (b: object) =>
      request(app.getHttpServer())
        .patch(`${base}/${body.id}`)
        .set('Authorization', as(U_EDITOR))
        .send(b);
    await patch({ endsOn: '2027-03-01' }).expect(400); // before the stored start date
    const ok = await patch({ name: 'Spring 2027', endsOn: '2027-03-20' }).expect(200);
    expect(ok.body.name).toBe('Spring 2027');
    await patch({ endsOn: null }).expect(200);
    const arch = await patch({ status: 'ARCHIVED' }).expect(200);
    expect(arch.body.status).toBe('ARCHIVED');
    await patch({ status: 'NOPE' }).expect(400);

    const active = await request(app.getHttpServer())
      .get(`${base}?status=ACTIVE`)
      .set('Authorization', as(U_VIEWER))
      .expect(200);
    expect(active.body).toHaveLength(0);

    // Archived campaigns take no new content.
    const p = piece();
    await request(app.getHttpServer())
      .post(`${base}/${body.id}/content`)
      .set('Authorization', as(U_EDITOR))
      .send({ contentIds: [p.id] })
      .expect(409);
  });

  it('removes content from a campaign, and deleting a campaign keeps its content', async () => {
    const { body } = await create({ name: 'Spring' }).expect(201);
    const a = piece();
    const b = piece();
    await request(app.getHttpServer())
      .post(`${base}/${body.id}/content`)
      .set('Authorization', as(U_EDITOR))
      .send({ contentIds: [a.id, b.id] })
      .expect(201);
    const after = await request(app.getHttpServer())
      .delete(`${base}/${body.id}/content/${a.id}`)
      .set('Authorization', as(U_EDITOR))
      .expect(200);
    expect(after.body.pieces.map((x: any) => x.id)).toEqual([b.id]);
    await request(app.getHttpServer())
      .delete(`${base}/${body.id}/content/${a.id}`)
      .set('Authorization', as(U_EDITOR))
      .expect(404); // not in it any more

    await request(app.getHttpServer())
      .delete(`${base}/${body.id}`)
      .set('Authorization', as(U_EDITOR))
      .expect(200);
    expect(campaigns).toHaveLength(0);
    expect(pieces).toHaveLength(2); // content survives
    expect(pieces.every((p) => p.campaignId === null)).toBe(true);
    await request(app.getHttpServer())
      .get(`${base}/${body.id}`)
      .set('Authorization', as(U_EDITOR))
      .expect(404);
  });

  it('only accepts content from the same organization, all or nothing', async () => {
    const { body } = await create({ name: 'Spring' }).expect(201);
    const mine = piece();
    const foreign = piece({ organizationId: ORG_B });
    await request(app.getHttpServer())
      .post(`${base}/${body.id}/content`)
      .set('Authorization', as(U_EDITOR))
      .send({ contentIds: [mine.id, foreign.id] })
      .expect(404);
    expect(mine.campaignId).toBeNull(); // nothing was attached
    expect(foreign.campaignId).toBeNull();
    await request(app.getHttpServer())
      .post(`${base}/${body.id}/content`)
      .set('Authorization', as(U_EDITOR))
      .send({ contentIds: [] })
      .expect(400);
    await request(app.getHttpServer())
      .post(`${base}/${body.id}/content`)
      .set('Authorization', as(U_EDITOR))
      .send({ contentIds: ['not-a-uuid'] })
      .expect(400);
  });

  it('enforces roles and isolates organizations', async () => {
    await create({ name: 'Spring' }, U_VIEWER).expect(403);
    await create({ name: 'Spring' }, U_APPROVER).expect(403);
    const { body } = await create({ name: 'Spring' }).expect(201);

    // Everyone in the organization can read; outsiders cannot even see it exists.
    await request(app.getHttpServer())
      .get(`${base}/${body.id}`)
      .set('Authorization', as(U_VIEWER))
      .expect(200);
    await request(app.getHttpServer())
      .get(`${base}/${body.id}`)
      .set('Authorization', as(U_OTHER))
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/organizations/${ORG_B}/campaigns/${body.id}`)
      .set('Authorization', as(U_OTHER))
      .expect(404);
    await request(app.getHttpServer())
      .delete(`${base}/${body.id}`)
      .set('Authorization', as(U_VIEWER))
      .expect(403);
    await request(app.getHttpServer())
      .patch(`${base}/${body.id}`)
      .set('Authorization', as(U_OTHER))
      .send({ name: 'Hijack' })
      .expect(404);
    await request(app.getHttpServer()).get(base).expect(401);
    await request(app.getHttpServer())
      .get(`${base}/not-a-uuid`)
      .set('Authorization', as(U_VIEWER))
      .expect(404);
  });
});
