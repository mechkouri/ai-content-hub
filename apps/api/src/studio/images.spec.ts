import { HttpException, HttpStatus, INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { AiService } from '../ai/ai.service';
import { AppModule } from '../app.module';
import { TOKEN_VERIFIER } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE } from '../storage/storage';
import { altTextOf, imageBriefOf, MAX_IMAGES } from './images.service';

const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';
const U_EDITOR = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const U_VIEWER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const U_APPROVER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const U_OTHER = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('fake image body'),
]);

describe('image briefs and limits', () => {
  it('finds the image idea in each kind of content', () => {
    expect(imageBriefOf('ARTICLE', { featuredImageBrief: ' Students on campus ' })).toBe(
      'Students on campus',
    );
    expect(imageBriefOf('INSTAGRAM', { imageBrief: 'A courtyard' })).toBe('A courtyard');
    expect(imageBriefOf('FACEBOOK', { images: [{ brief: 'Open day crowd', altText: 'x' }] })).toBe(
      'Open day crowd',
    );
    expect(imageBriefOf('LINKEDIN', { images: [] })).toBeNull();
    expect(imageBriefOf('ARTICLE', { featuredImageBrief: '  ' })).toBeNull();
  });

  it('finds the description the writer produced for each picture', () => {
    expect(altTextOf('ARTICLE', { imageAltText: ' Students on campus ' }, 0)).toBe(
      'Students on campus',
    );
    expect(altTextOf('INSTAGRAM', { altText: 'A courtyard' }, 0)).toBe('A courtyard');
    const fb = {
      images: [
        { brief: 'x', altText: 'First' },
        { brief: 'y', altText: 'Second' },
      ],
    };
    expect(altTextOf('FACEBOOK', fb, 0)).toBe('First');
    expect(altTextOf('LINKEDIN', fb, 1)).toBe('Second');
    expect(altTextOf('FACEBOOK', fb, 2)).toBeNull(); // more pictures than descriptions
    expect(altTextOf('ARTICLE', {}, 0)).toBeNull();
    expect(altTextOf('INSTAGRAM', { altText: 'x'.repeat(900) }, 0)).toHaveLength(500);
  });

  it('knows how many images each kind can carry', () => {
    expect(MAX_IMAGES).toEqual({ ARTICLE: 1, INSTAGRAM: 10, FACEBOOK: 10, LINKEDIN: 9 });
  });
});

let memberships: { userId: string; organizationId: string; role: Role }[];
let pieces: any[];
let assets: any[];
let attached: any[];
let stored: Map<string, Buffer>;

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
  contentPiece: {
    findFirst: jest.fn(
      async ({ where }: any) =>
        pieces.find((p) => p.id === where.id && p.organizationId === where.organizationId) ?? null,
    ),
    update: jest.fn(async ({ where, data }: any) =>
      Object.assign(
        pieces.find((p) => p.id === where.id),
        data,
      ),
    ),
  },
  mediaAsset: {
    findFirst: jest.fn(
      async ({ where }: any) =>
        assets.find((a) => a.id === where.id && a.organizationId === where.organizationId) ?? null,
    ),
    create: jest.fn(async ({ data }: any) => {
      const a = { id: randomUUID(), createdAt: new Date(), ...data };
      assets.push(a);
      return a;
    }),
  },
  contentImage: {
    findMany: jest.fn(async ({ where, include }: any) =>
      attached
        .filter(
          (c) =>
            c.contentId === where.contentId &&
            (!where.organizationId || c.organizationId === where.organizationId),
        )
        .sort((a, b) => a.position - b.position)
        .map((c) => (include ? { ...c, asset: assets.find((a) => a.id === c.assetId) } : c)),
    ),
    count: jest.fn(
      async ({ where }: any) => attached.filter((c) => c.contentId === where.contentId).length,
    ),
    create: jest.fn(async ({ data }: any) => {
      const c = { id: randomUUID(), createdAt: new Date(), ...data };
      attached.push(c);
      return c;
    }),
    updateMany: jest.fn(async ({ where, data }: any) => {
      const hit = attached.filter(
        (c) =>
          c.contentId === where.contentId &&
          c.assetId === where.assetId &&
          c.organizationId === where.organizationId,
      );
      hit.forEach((c) => Object.assign(c, data));
      return { count: hit.length };
    }),
    deleteMany: jest.fn(async ({ where }: any) => {
      const before = attached.length;
      attached = attached.filter(
        (c) =>
          !(
            c.contentId === where.contentId &&
            c.assetId === where.assetId &&
            c.organizationId === where.organizationId
          ),
      );
      return { count: before - attached.length };
    }),
  },
  publishJob: { updateMany: jest.fn(async () => ({ count: 0 })) },
  contentReview: { create: jest.fn(async () => ({})), findMany: jest.fn(async () => []) },
};

const aiMock = {
  generateJson: jest.fn(),
  generateImage: jest.fn(async () => ({
    data: PNG,
    mimeType: 'image/png',
    model: 'flux',
    provider: 'cloudflare',
  })),
};

describe('content images API', () => {
  let app: INestApplication;
  const as = (id: string) => `Bearer user:${id}`;
  const base = `/api/organizations/${ORG_A}/content`;

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
      .overrideProvider(AiService)
      .useValue(aiMock)
      .overrideProvider(STORAGE)
      .useValue({
        put: async (k: string, d: Buffer) => void stored.set(k, d),
        get: async (k: string) => stored.get(k)!,
        delete: async (k: string) => void stored.delete(k),
      })
      .compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });
  afterAll(() => app.close());

  const piece = (over: Record<string, unknown> = {}) => {
    const p: any = {
      id: randomUUID(),
      organizationId: ORG_A,
      kind: 'FACEBOOK',
      approvalStatus: 'DRAFT',
      content: { postText: 'Hello', images: [{ brief: 'Open day crowd', altText: 'Crowd' }] },
      ...over,
    };
    pieces.push(p);
    return p;
  };
  const asset = (org = ORG_A) => {
    const a = {
      id: randomUUID(),
      organizationId: org,
      filename: 'a.png',
      mimeType: 'image/png',
      sizeBytes: 10,
    };
    assets.push(a);
    return a;
  };

  beforeEach(() => {
    pieces = [];
    assets = [];
    attached = [];
    stored = new Map();
    memberships = [
      { userId: U_EDITOR, organizationId: ORG_A, role: Role.EDITOR },
      { userId: U_VIEWER, organizationId: ORG_A, role: Role.VIEWER },
      { userId: U_APPROVER, organizationId: ORG_A, role: Role.APPROVER },
      { userId: U_OTHER, organizationId: ORG_B, role: Role.OWNER },
    ];
    aiMock.generateImage.mockClear();
    aiMock.generateImage.mockResolvedValue({
      data: PNG,
      mimeType: 'image/png',
      model: 'flux',
      provider: 'cloudflare',
    });
  });

  const attach = (id: string, assetId: string, user = U_EDITOR) =>
    request(app.getHttpServer())
      .post(`${base}/${id}/images`)
      .set('Authorization', as(user))
      .send({ assetId });
  const draw = (id: string, body: object = {}, user = U_EDITOR) =>
    request(app.getHttpServer())
      .post(`${base}/${id}/images/generate`)
      .set('Authorization', as(user))
      .send(body);
  const list = (id: string, user = U_VIEWER) =>
    request(app.getHttpServer()).get(`${base}/${id}/images`).set('Authorization', as(user));

  it('attaches library images in order, lists them, and removes one', async () => {
    const p = piece();
    const [a, b] = [asset(), asset()];
    await attach(p.id, a.id).expect(201);
    const res = await attach(p.id, b.id).expect(201);
    expect(res.body.map((i: any) => i.assetId)).toEqual([a.id, b.id]);
    expect(res.body.map((i: any) => i.position)).toEqual([0, 1]);
    expect(res.body[0].asset.filename).toBe('a.png');

    expect((await list(p.id).expect(200)).body).toHaveLength(2);
    await attach(p.id, a.id).expect(409); // already attached

    const after = await request(app.getHttpServer())
      .delete(`${base}/${p.id}/images/${a.id}`)
      .set('Authorization', as(U_EDITOR))
      .expect(200);
    expect(after.body.map((i: any) => i.assetId)).toEqual([b.id]);
    await request(app.getHttpServer())
      .delete(`${base}/${p.id}/images/${a.id}`)
      .set('Authorization', as(U_EDITOR))
      .expect(404);
    // The next one goes after the last, so order stays stable after removals.
    const c = asset();
    const again = await attach(p.id, c.id).expect(201);
    expect(again.body.map((i: any) => i.assetId)).toEqual([b.id, c.id]);
  });

  it('enforces the image limit of each kind', async () => {
    const article = piece({ kind: 'ARTICLE', content: { featuredImageBrief: 'x' } });
    await attach(article.id, asset().id).expect(201);
    const res = await attach(article.id, asset().id).expect(409);
    expect(String(res.body.message)).toMatch(/one image/);

    const linkedin = piece({ kind: 'LINKEDIN', content: {} });
    for (let i = 0; i < 9; i++) await attach(linkedin.id, asset().id).expect(201);
    expect(
      String(((await attach(linkedin.id, asset().id).expect(409)).body as any).message),
    ).toMatch(/at most 9/);
  });

  it('only accepts images from the same organization and refuses outsiders', async () => {
    const p = piece();
    const foreign = asset(ORG_B);
    await attach(p.id, foreign.id).expect(404);
    await attach(p.id, randomUUID()).expect(404);
    await attach(p.id, 'not-a-uuid').expect(400);
    const mine = asset();
    await attach(p.id, mine.id, U_VIEWER).expect(403);
    await attach(p.id, mine.id, U_APPROVER).expect(403);
    await attach(p.id, mine.id, U_OTHER).expect(404);
    await list(p.id, U_OTHER).expect(404);
    await request(app.getHttpServer()).get(`${base}/${p.id}/images`).expect(401);
    await request(app.getHttpServer())
      .get(`${base}/not-a-uuid/images`)
      .set('Authorization', as(U_VIEWER))
      .expect(404);
  });

  it('voids an approval when the pictures change', async () => {
    const p = piece({ approvalStatus: 'APPROVED' });
    const a = asset();
    await attach(p.id, a.id).expect(201);
    expect(p.approvalStatus).toBe('DRAFT');
    p.approvalStatus = 'IN_REVIEW';
    await request(app.getHttpServer())
      .delete(`${base}/${p.id}/images/${a.id}`)
      .set('Authorization', as(U_EDITOR))
      .expect(200);
    expect(p.approvalStatus).toBe('DRAFT');
  });

  describe('picture descriptions', () => {
    const describe_ = (id: string, assetId: string, altText: string, user = U_EDITOR) =>
      request(app.getHttpServer())
        .patch(`${base}/${id}/images/${assetId}`)
        .set('Authorization', as(user))
        .send({ altText });

    it('starts from the writer’s description, in order, and shows it in the list', async () => {
      const p = piece({
        content: {
          postText: 'Hello',
          images: [
            { brief: 'a', altText: 'Crowd at the open day' },
            { brief: 'b', altText: 'Teacher in a lab' },
          ],
        },
      });
      const [a, b, c] = [asset(), asset(), asset()];
      await attach(p.id, a.id).expect(201);
      await attach(p.id, b.id).expect(201);
      const res = await attach(p.id, c.id).expect(201);
      expect(res.body.map((i: any) => i.altText)).toEqual([
        'Crowd at the open day',
        'Teacher in a lab',
        null,
      ]);
    });

    it('is changed or cleared by editors, and a drawn picture gets the description of its idea', async () => {
      const p = piece({
        content: { postText: 'Hi', images: [{ brief: 'Open day crowd', altText: 'Crowd' }] },
      });
      const drawn = await draw(p.id).expect(201);
      expect(drawn.body[0].altText).toBe('Crowd'); // the writer's description wins over the picture idea text
      const id = drawn.body[0].assetId;

      const changed = await describe_(
        p.id,
        id,
        '  A crowd of students at the Rabat campus  ',
      ).expect(200);
      expect(changed.body[0].altText).toBe('A crowd of students at the Rabat campus');
      const cleared = await describe_(p.id, id, '   ').expect(200);
      expect(cleared.body[0].altText).toBeNull();
    });

    it('rejects bad input, strangers and pictures that are not attached', async () => {
      const p = piece();
      const a = asset();
      await attach(p.id, a.id).expect(201);
      await describe_(p.id, a.id, 'x'.repeat(501)).expect(400);
      await request(app.getHttpServer())
        .patch(`${base}/${p.id}/images/${a.id}`)
        .set('Authorization', as(U_EDITOR))
        .send({})
        .expect(400);
      await describe_(p.id, asset().id, 'Not attached').expect(404);
      await describe_(p.id, a.id, 'Nope', U_VIEWER).expect(403);
      await describe_(p.id, a.id, 'Nope', U_APPROVER).expect(403);
      await describe_(p.id, a.id, 'Nope', U_OTHER).expect(404);
      await describe_('not-a-uuid', a.id, 'Nope').expect(404);
    });

    it('voids an approval, because the post would no longer be what was approved', async () => {
      const p = piece();
      const a = asset();
      await attach(p.id, a.id).expect(201);
      p.approvalStatus = 'APPROVED';
      await describe_(p.id, a.id, 'A new description').expect(200);
      expect(p.approvalStatus).toBe('DRAFT');
    });
  });

  describe('drawing a picture', () => {
    it('uses the content’s own image idea, saves it to the media library and attaches it', async () => {
      const p = piece();
      const res = await draw(p.id).expect(201);
      expect(aiMock.generateImage).toHaveBeenCalledWith(
        { orgId: ORG_A, userId: U_EDITOR },
        { prompt: 'Open day crowd' },
      );
      expect(res.body).toHaveLength(1);
      expect(assets).toHaveLength(1);
      expect(assets[0].mimeType).toBe('image/png');
      expect(assets[0].filename).toMatch(/^generated-.*\.png$/);
      expect(stored.get(assets[0].storageKey)).toEqual(PNG);
    });

    it('takes a custom prompt, and needs one when the content has no image idea', async () => {
      const bare = piece({ content: { postText: 'Hello', images: [] } });
      await draw(bare.id).expect(400);
      expect(aiMock.generateImage).not.toHaveBeenCalled();
      const drawn = await draw(bare.id, { prompt: 'A bright lecture hall' }).expect(201);
      expect(drawn.body[0].altText).toBe('A bright lecture hall'); // the content has no description of its own
      expect(aiMock.generateImage).toHaveBeenCalledWith(expect.anything(), {
        prompt: 'A bright lecture hall',
      });
      await draw(bare.id, { prompt: 'ab' }).expect(400);
    });

    it('does not spend an AI image when nothing more can be attached', async () => {
      const article = piece({ kind: 'ARTICLE', content: { featuredImageBrief: 'Campus' } });
      await attach(article.id, asset().id).expect(201);
      await draw(article.id).expect(409);
      expect(aiMock.generateImage).not.toHaveBeenCalled();
    });

    it('passes AI limits through and saves nothing when drawing fails', async () => {
      aiMock.generateImage.mockRejectedValueOnce(
        new HttpException(
          { code: 'QUOTA_EXHAUSTED', message: 'Limit reached' },
          HttpStatus.TOO_MANY_REQUESTS,
        ),
      );
      const p = piece();
      await draw(p.id).expect(429);
      expect(assets).toHaveLength(0);
      expect(attached).toHaveLength(0);
    });

    it('refuses a result that is not a real image', async () => {
      aiMock.generateImage.mockResolvedValueOnce({
        data: Buffer.from('not an image'),
        mimeType: 'image/png',
        model: 'm',
        provider: 'p',
      });
      const p = piece();
      await draw(p.id).expect(400);
      expect(attached).toHaveLength(0);
    });

    it('is limited to people who may use AI and edit content', async () => {
      const p = piece();
      await draw(p.id, {}, U_VIEWER).expect(403);
      await draw(p.id, {}, U_APPROVER).expect(403);
      await draw(p.id, {}, U_OTHER).expect(404);
    });
  });
});
