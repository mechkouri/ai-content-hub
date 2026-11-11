import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { AppModule } from '../app.module';
import { TOKEN_VERIFIER } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { detectImageType, sanitizeFilename } from '../storage/image-type';
import { STORAGE } from '../storage/storage';

const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';
const U_OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const U_DESIGNER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const U_VIEWER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const LOGO_A = '33333333-3333-4333-8333-333333333333';
const LOGO_B = '44444444-4444-4444-8444-444444444444';

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(32),
]);

let memberships: { id: string; userId: string; organizationId: string; role: Role }[];
let kits: any[];
let assets: any[];
const files = new Map<string, Buffer>();

const prismaMock: any = {
  user: { upsert: vi.fn().mockResolvedValue({}) },
  membership: {
    findUnique: vi.fn(async ({ where }: any) => {
      const k = where.userId_organizationId;
      return (
        memberships.find((m) => m.userId === k.userId && m.organizationId === k.organizationId) ??
        null
      );
    }),
  },
  mediaAsset: {
    count: vi.fn(
      async ({ where }: any) =>
        assets.filter(
          (a) => where.id.in.includes(a.id) && a.organizationId === where.organizationId,
        ).length,
    ),
    create: vi.fn(async ({ data }: any) => {
      const a = { id: `asset-${assets.length + 1}`, createdAt: new Date(), ...data };
      assets.push(a);
      return a;
    }),
    findMany: vi.fn(async ({ where }: any) =>
      assets.filter((a) => a.organizationId === where.organizationId),
    ),
    findFirst: vi.fn(
      async ({ where }: any) =>
        assets.find((a) => a.id === where.id && a.organizationId === where.organizationId) ?? null,
    ),
    delete: vi.fn(async ({ where }: any) => {
      assets = assets.filter((a) => a.id !== where.id);
    }),
  },
  brandKit: {
    findMany: vi.fn(async ({ where }: any) =>
      kits.filter((k) => k.organizationId === where.organizationId),
    ),
    findFirst: vi.fn(async ({ where, orderBy }: any) => {
      let list = kits.filter((k) => k.organizationId === where.organizationId);
      if (where.isActive !== undefined) list = list.filter((k) => k.isActive === where.isActive);
      if (where.id) list = list.filter((k) => k.id === where.id);
      if (orderBy?.version === 'desc') list = [...list].sort((a, b) => b.version - a.version);
      return list[0] ?? null;
    }),
    findUnique: vi.fn(async ({ where }: any) => kits.find((k) => k.id === where.id) ?? null),
    updateMany: vi.fn(async ({ where, data }: any) => {
      kits
        .filter((k) => k.organizationId === where.organizationId && k.isActive === where.isActive)
        .forEach((k) => Object.assign(k, data));
    }),
    update: vi.fn(async ({ where, data }: any) =>
      Object.assign(
        kits.find((k) => k.id === where.id),
        data,
      ),
    ),
    create: vi.fn(async ({ data }: any) => {
      const k = { id: randomUUID(), ...data };
      kits.push(k);
      return k;
    }),
  },
  $transaction: vi.fn(async (arg: any) =>
    typeof arg === 'function' ? arg(prismaMock) : Promise.all(arg),
  ),
};

const as = (id: string) => `Bearer user:${id}`;

describe('brand kit & media', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(TOKEN_VERIFIER)
      .useValue({
        verify: async (t: string) => {
          if (!t.startsWith('user:')) throw new UnauthorizedException();
          const id = t.split(':')[1];
          return { id, email: `${id}@x.test` };
        },
      })
      .overrideProvider(STORAGE)
      .useValue({
        put: async (k: string, d: Buffer) => void files.set(k, d),
        get: async (k: string) => files.get(k)!,
        delete: async (k: string) => void files.delete(k),
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
      { id: 'm2', userId: U_DESIGNER, organizationId: ORG_A, role: Role.DESIGNER },
      { id: 'm3', userId: U_VIEWER, organizationId: ORG_A, role: Role.VIEWER },
      { id: 'm4', userId: U_OWNER, organizationId: ORG_B, role: Role.OWNER },
    ];
    kits = [];
    assets = [
      {
        id: LOGO_A,
        organizationId: ORG_A,
        filename: 'a.png',
        mimeType: 'image/png',
        sizeBytes: 40,
        storageKey: `${ORG_A}/a.png`,
      },
      {
        id: LOGO_B,
        organizationId: ORG_B,
        filename: 'b.png',
        mimeType: 'image/png',
        sizeBytes: 40,
        storageKey: `${ORG_B}/b.png`,
      },
    ];
    files.clear();
    files.set(`${ORG_A}/a.png`, PNG);
    files.set(`${ORG_B}/b.png`, PNG);
  });

  const kitsUrl = `/api/organizations/${ORG_A}/brand-kits`;
  const mediaUrl = `/api/organizations/${ORG_A}/media`;

  describe('brand kits', () => {
    it('returns 404 when there is no active kit', async () => {
      await request(app.getHttpServer())
        .get(`${kitsUrl}/active`)
        .set('Authorization', as(U_VIEWER))
        .expect(404);
    });

    it('creates versions; each new one becomes the only active kit and inherits omitted fields', async () => {
      const server = app.getHttpServer();
      const v1 = await request(server)
        .post(kitsUrl)
        .set('Authorization', as(U_DESIGNER))
        .send({ primaryColor: '#112233', headingFont: 'Poppins' })
        .expect(201);
      expect(v1.body.version).toBe(1);
      const v2 = await request(server)
        .post(kitsUrl)
        .set('Authorization', as(U_DESIGNER))
        .send({ accentColor: '#AABBCC' })
        .expect(201);
      expect(v2.body).toMatchObject({
        version: 2,
        primaryColor: '#112233',
        headingFont: 'Poppins',
        accentColor: '#AABBCC',
      });
      expect(kits.filter((k) => k.isActive)).toHaveLength(1);
      const active = await request(server)
        .get(`${kitsUrl}/active`)
        .set('Authorization', as(U_VIEWER))
        .expect(200);
      expect(active.body.version).toBe(2);
    });

    it('can activate an older version', async () => {
      const server = app.getHttpServer();
      const v1 = await request(server)
        .post(kitsUrl)
        .set('Authorization', as(U_OWNER))
        .send({ primaryColor: '#111111' })
        .expect(201);
      await request(server)
        .post(kitsUrl)
        .set('Authorization', as(U_OWNER))
        .send({ primaryColor: '#222222' })
        .expect(201);
      const res = await request(server)
        .post(`${kitsUrl}/${v1.body.id}/activate`)
        .set('Authorization', as(U_OWNER))
        .expect(201);
      expect(res.body.primaryColor).toBe('#111111');
      expect(kits.filter((k) => k.isActive).map((k) => k.version)).toEqual([1]);
      await request(server)
        .post(`${kitsUrl}/not-a-uuid/activate`)
        .set('Authorization', as(U_OWNER))
        .expect(404);
      await request(server)
        .post(`${kitsUrl}/${randomUUID()}/activate`)
        .set('Authorization', as(U_OWNER))
        .expect(404);
    });

    it('forbids viewers from writing (403) but lets them read', async () => {
      await request(app.getHttpServer())
        .post(kitsUrl)
        .set('Authorization', as(U_VIEWER))
        .send({})
        .expect(403);
      await request(app.getHttpServer())
        .get(kitsUrl)
        .set('Authorization', as(U_VIEWER))
        .expect(200);
    });

    it('validates colors, fonts and URLs (400)', async () => {
      const post = (body: object) =>
        request(app.getHttpServer()).post(kitsUrl).set('Authorization', as(U_OWNER)).send(body);
      await post({ primaryColor: 'red' }).expect(400);
      await post({ headingFont: '<script>' }).expect(400);
      await post({ websiteUrl: 'javascript:alert(1)' }).expect(400);
      await post({
        socialUrls: { facebook: 'https://facebook.com/x', myspace: 'https://x.y' },
      }).expect(400);
    });

    it("rejects another organization's logo (400)", async () => {
      await request(app.getHttpServer())
        .post(kitsUrl)
        .set('Authorization', as(U_OWNER))
        .send({ mainLogoId: LOGO_B })
        .expect(400);
      await request(app.getHttpServer())
        .post(kitsUrl)
        .set('Authorization', as(U_OWNER))
        .send({ mainLogoId: LOGO_A })
        .expect(201);
    });

    it('hides other organizations entirely (404)', async () => {
      await request(app.getHttpServer())
        .get(`/api/organizations/${ORG_B}/brand-kits`)
        .set('Authorization', as(U_VIEWER))
        .expect(404);
    });
  });

  describe('media', () => {
    it('uploads a real PNG, storing it under the organization prefix', async () => {
      const res = await request(app.getHttpServer())
        .post(mediaUrl)
        .set('Authorization', as(U_DESIGNER))
        .attach('file', PNG, { filename: '../../evil name!.png', contentType: 'image/png' })
        .expect(201);
      expect(res.body.mimeType).toBe('image/png');
      expect(res.body.storageKey.startsWith(`${ORG_A}/`)).toBe(true);
      expect(res.body.filename).not.toMatch(/[/\\]/);
    });

    it('rejects files whose content is not a supported image, even with an image content-type', async () => {
      await request(app.getHttpServer())
        .post(mediaUrl)
        .set('Authorization', as(U_DESIGNER))
        .attach('file', Buffer.from('<svg onload=alert(1)></svg>'), {
          filename: 'x.png',
          contentType: 'image/png',
        })
        .expect(400);
    });

    it('rejects missing files (400) and oversized files (413)', async () => {
      await request(app.getHttpServer())
        .post(mediaUrl)
        .set('Authorization', as(U_DESIGNER))
        .expect(400);
      await request(app.getHttpServer())
        .post(mediaUrl)
        .set('Authorization', as(U_DESIGNER))
        .attach('file', Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]), {
          filename: 'big.png',
          contentType: 'image/png',
        })
        .expect(413);
    });

    it('forbids viewers from uploading and deleting', async () => {
      await request(app.getHttpServer())
        .post(mediaUrl)
        .set('Authorization', as(U_VIEWER))
        .attach('file', PNG, 'a.png')
        .expect(403);
      await request(app.getHttpServer())
        .delete(`${mediaUrl}/${LOGO_A}`)
        .set('Authorization', as(U_VIEWER))
        .expect(403);
    });

    it('serves content with safe headers and blocks access across organizations', async () => {
      const ok = await request(app.getHttpServer())
        .get(`${mediaUrl}/${LOGO_A}/content`)
        .set('Authorization', as(U_VIEWER))
        .expect(200);
      expect(ok.headers['content-type']).toContain('image/png');
      expect(ok.headers['x-content-type-options']).toBe('nosniff');
      // asset id from ORG_B requested through ORG_A's URL
      await request(app.getHttpServer())
        .get(`${mediaUrl}/${LOGO_B}/content`)
        .set('Authorization', as(U_OWNER))
        .expect(404);
      await request(app.getHttpServer())
        .delete(`${mediaUrl}/${LOGO_B}`)
        .set('Authorization', as(U_OWNER))
        .expect(404);
      expect(files.has(`${ORG_B}/b.png`)).toBe(true);
    });

    it('deletes an asset and its stored file', async () => {
      await request(app.getHttpServer())
        .delete(`${mediaUrl}/${LOGO_A}`)
        .set('Authorization', as(U_DESIGNER))
        .expect(200);
      expect(files.has(`${ORG_A}/a.png`)).toBe(false);
    });
  });

  describe('helpers', () => {
    it('detects image types by magic bytes', () => {
      expect(detectImageType(PNG)?.mime).toBe('image/png');
      expect(detectImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))?.mime).toBe('image/jpeg');
      expect(detectImageType(Buffer.from('RIFF0000WEBPxxxx'))?.mime).toBe('image/webp');
      expect(detectImageType(Buffer.from('GIF89a..'))?.mime).toBe('image/gif');
      expect(detectImageType(Buffer.from('<svg></svg>'))).toBeNull();
    });
    it('sanitizes filenames', () => {
      expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
      expect(sanitizeFilename('a<b>.png')).toBe('a_b_.png');
      expect(sanitizeFilename('...')).toBe('file');
    });
  });
});
