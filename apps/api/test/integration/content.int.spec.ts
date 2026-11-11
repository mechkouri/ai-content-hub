import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
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
type U = { id: string; email: string };
const as = (u: U) => bearer(u.id, u.email);

const post = {
  postText: 'Open day on Saturday. Meet our teachers.',
  cta: 'Register now',
  link: null,
  images: [],
  hashtags: ['#OpenDay'],
};

/** An organization with a source, verified facts and one Facebook draft, plus a second tenant. */
async function setup() {
  const [owner, editor, viewer, outsider] = await Promise.all([
    seedUser('c-owner@test.dev'),
    seedUser('c-editor@test.dev'),
    seedUser('c-viewer@test.dev'),
    seedUser('c-outsider@test.dev'),
  ]);
  const org = await seedOrg('Content Org', [
    { userId: owner.id, role: Role.OWNER },
    { userId: editor.id, role: Role.EDITOR },
    { userId: viewer.id, role: Role.VIEWER },
  ]);
  const other = await seedOrg('Other Org', [{ userId: outsider.id, role: Role.OWNER }]);

  const source = await prisma().source.create({
    data: {
      organizationId: org.id,
      type: 'TEXT',
      status: 'EXTRACTED',
      title: 'Open day announcement',
      originalText: 'Our open day is on Saturday. Meet our teachers.',
      createdById: owner.id,
      facts: {
        create: [
          {
            kind: 'event',
            value: 'Open day on Saturday',
            quote: 'open day is on Saturday',
            verified: true,
          },
        ],
      },
    },
  });
  const piece = await prisma().contentPiece.create({
    data: {
      organizationId: org.id,
      sourceId: source.id,
      kind: 'FACEBOOK',
      language: 'en',
      title: 'Open day on Saturday.',
      content: post,
      createdById: owner.id,
    },
  });
  return { owner, editor, viewer, outsider, org, other, source, piece };
}

describe('content pieces: permissions', () => {
  it('lets every member read and list content', async () => {
    const { org, piece, viewer } = await setup();
    const list = await api()
      .get(`/api/organizations/${org.id}/content`)
      .set('Authorization', await as(viewer))
      .expect(200);
    expect(list.body.map((p: { id: string }) => p.id)).toEqual([piece.id]);
    await api()
      .get(`/api/organizations/${org.id}/content/${piece.id}`)
      .set('Authorization', await as(viewer))
      .expect(200);
  });

  it('keeps viewers from editing, deleting or generating content', async () => {
    const { org, piece, source, viewer } = await setup();
    const auth = await as(viewer);
    await api()
      .patch(`/api/organizations/${org.id}/content/${piece.id}`)
      .set('Authorization', auth)
      .send({ content: { ...post, postText: 'Changed by a viewer' } })
      .expect(403);
    await api()
      .delete(`/api/organizations/${org.id}/content/${piece.id}`)
      .set('Authorization', auth)
      .expect(403);
    await api()
      .post(`/api/organizations/${org.id}/content/generate`)
      .set('Authorization', auth)
      .send({ sourceId: source.id, kind: 'FACEBOOK' })
      .expect(403);

    const stored = await prisma().contentPiece.findUniqueOrThrow({ where: { id: piece.id } });
    expect(stored.edited).toBe(false);
    expect(stored.content).toEqual(post);
  });
});

describe('content pieces: editing', () => {
  it('saves a valid human edit and marks the piece as edited', async () => {
    const { org, piece, editor } = await setup();
    const res = await api()
      .patch(`/api/organizations/${org.id}/content/${piece.id}`)
      .set('Authorization', await as(editor))
      .send({ content: { ...post, postText: 'Open day on Saturday. Come and meet us.' } })
      .expect(200);
    expect(res.body.piece.edited).toBe(true);

    const stored = await prisma().contentPiece.findUniqueOrThrow({ where: { id: piece.id } });
    expect(stored.edited).toBe(true);
    expect(stored.content).toMatchObject({ postText: 'Open day on Saturday. Come and meet us.' });
  });

  it.each([
    ['empty post text', { ...post, postText: '   ' }],
    ['missing call to action', { postText: 'Hello', images: [], hashtags: [] }],
    ['too many hashtags', { ...post, hashtags: ['#aa', '#bb', '#cc', '#dd', '#ee', '#ff'] }],
  ])('rejects %s and leaves the stored content untouched', async (_label, content) => {
    const { org, piece, editor } = await setup();
    await api()
      .patch(`/api/organizations/${org.id}/content/${piece.id}`)
      .set('Authorization', await as(editor))
      .send({ content })
      .expect(400);
    const stored = await prisma().contentPiece.findUniqueOrThrow({ where: { id: piece.id } });
    expect(stored.edited).toBe(false);
    expect(stored.content).toEqual(post);
  });

  it('deletes only the requested piece', async () => {
    const { org, piece, source, owner } = await setup();
    const keep = await prisma().contentPiece.create({
      data: {
        organizationId: org.id,
        sourceId: source.id,
        kind: 'FACEBOOK',
        language: 'en',
        title: 'Keep me',
        content: post,
        createdById: owner.id,
      },
    });
    await api()
      .delete(`/api/organizations/${org.id}/content/${piece.id}`)
      .set('Authorization', await as(owner))
      .expect(200);
    const left = await prisma().contentPiece.findMany({ where: { organizationId: org.id } });
    expect(left.map((p) => p.id)).toEqual([keep.id]);
  });
});

describe('content pieces: generation without an AI provider', () => {
  it('fails with a clear error, creates nothing and spends no quota', async () => {
    const { org, source, editor } = await setup();
    const res = await api()
      .post(`/api/organizations/${org.id}/content/generate`)
      .set('Authorization', await as(editor))
      .send({ sourceId: source.id, kind: 'FACEBOOK' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(res.body)).toMatch(/not configured|configur|provider/i);
    expect(await prisma().contentPiece.count()).toBe(1); // only the seeded draft
    expect(await prisma().aiUsage.count({ where: { status: 'SUCCESS' } })).toBe(0);
  });

  it('rejects invalid generation requests before doing any work', async () => {
    const { org, source, editor } = await setup();
    const auth = await as(editor);
    const gen = (body: object) =>
      api()
        .post(`/api/organizations/${org.id}/content/generate`)
        .set('Authorization', auth)
        .send(body);
    expect((await gen({ sourceId: 'nope', kind: 'FACEBOOK' })).status).toBe(400);
    expect((await gen({ sourceId: source.id, kind: 'TIKTOK' })).status).toBe(400);
    expect(
      (await gen({ sourceId: source.id, kind: 'FACEBOOK', options: { length: 'huge' } })).status,
    ).toBe(400);
    expect(await prisma().aiUsage.count()).toBe(0);
  });
});

describe('content pieces: cross-tenant isolation', () => {
  it("hides another organization's content and never changes it", async () => {
    const { org, piece, outsider } = await setup();
    const auth = await as(outsider);
    await api().get(`/api/organizations/${org.id}/content`).set('Authorization', auth).expect(404);
    await api()
      .get(`/api/organizations/${org.id}/content/${piece.id}`)
      .set('Authorization', auth)
      .expect(404);
    await api()
      .patch(`/api/organizations/${org.id}/content/${piece.id}`)
      .set('Authorization', auth)
      .send({ content: { ...post, postText: 'Hijacked' } })
      .expect(404);
    await api()
      .delete(`/api/organizations/${org.id}/content/${piece.id}`)
      .set('Authorization', auth)
      .expect(404);

    const stored = await prisma().contentPiece.findUniqueOrThrow({ where: { id: piece.id } });
    expect(stored.content).toEqual(post);
  });

  it("cannot reach another tenant's piece through your own organization path", async () => {
    const { other, piece, outsider } = await setup();
    const auth = await as(outsider);
    await api()
      .get(`/api/organizations/${other.id}/content/${piece.id}`)
      .set('Authorization', auth)
      .expect(404);
    await api()
      .delete(`/api/organizations/${other.id}/content/${piece.id}`)
      .set('Authorization', auth)
      .expect(404);
    expect(await prisma().contentPiece.count({ where: { id: piece.id } })).toBe(1);
  });

  it("cannot generate from another tenant's source", async () => {
    const { other, source, outsider } = await setup();
    const res = await api()
      .post(`/api/organizations/${other.id}/content/generate`)
      .set('Authorization', await as(outsider))
      .send({ sourceId: source.id, kind: 'FACEBOOK' });
    expect(res.status).toBe(404);
    expect(await prisma().aiUsage.count()).toBe(0);
  });
});
