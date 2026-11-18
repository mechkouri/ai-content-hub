import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import sharp from 'sharp';
import request from 'supertest';
import { AppModule } from '../app.module';
import { TOKEN_VERIFIER } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { StockImagesService } from './stock-images.service';

const ORG = '11111111-1111-4111-8111-111111111111';
const U_EDITOR = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const U_VIEWER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const U_OTHER = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const openverse = (over: Record<string, unknown> = {}) => ({
  id: 'abc-1',
  title: 'Students <b>on</b> campus',
  url: 'https://live.staticflickr.com/1/photo.jpg',
  thumbnail: 'https://api.openverse.org/v1/images/abc-1/thumb/',
  creator: 'Jane Doe',
  license: 'by',
  license_version: '4.0',
  foreign_landing_url: 'https://www.flickr.com/photos/1/2',
  source: 'flickr',
  width: 4000,
  height: 3000,
  ...over,
});

describe('free picture search', () => {
  const make = (fetchFn: any, pexelsKey?: string) =>
    new StockImagesService({} as any, { fetchFn, pexelsKey });

  it('offers Openverse always and Pexels only with a key', () => {
    expect(make(jest.fn()).providers()).toEqual([
      { id: 'openverse', name: 'Openverse', available: true, needsKey: false },
      { id: 'pexels', name: 'Pexels', available: false, needsKey: true },
    ]);
    expect(make(jest.fn(), 'k'.repeat(20)).providers()[1].available).toBe(true);
  });

  it('searches Openverse for pictures a business may use, and prepares the credit', async () => {
    const fetchFn = jest.fn(async () =>
      json({
        results: [
          openverse(),
          openverse({ id: 'cc0', license: 'cc0', license_version: '1.0', creator: '' }),
          openverse({ id: 'pd', license: 'pdm', license_version: '1.0' }),
          openverse({ id: 'http', url: 'http://insecure.example/a.jpg' }), // not https: dropped
          openverse({ id: '', title: 'no id' }),
          { id: 'nourl' },
        ],
      }),
    );
    const out = await make(fetchFn).search('openverse', 'campus life', 2);
    const url = new URL(String((fetchFn.mock.calls[0] as any[])[0]));
    expect(url.origin + url.pathname).toBe('https://api.openverse.org/v1/images/');
    expect(url.searchParams.get('q')).toBe('campus life');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('license_type')).toBe('commercial');
    expect(url.searchParams.get('mature')).toBe('false');

    expect(out.map((i) => i.id)).toEqual(['abc-1', 'cc0', 'pd']);
    expect(out[0]).toMatchObject({
      provider: 'openverse',
      title: 'Students on campus', // markup removed
      alt: 'Students on campus',
      creator: 'Jane Doe',
      license: 'CC BY 4.0',
      creditRequired: true,
      credit: 'Photo: Jane Doe · CC BY 4.0 · flickr',
      sourceUrl: 'https://www.flickr.com/photos/1/2',
      width: 4000,
    });
    expect(out[1]).toMatchObject({ license: 'CC0', creditRequired: false });
    expect(out[1].credit).toContain('unknown author');
    expect(out[2]).toMatchObject({ license: 'Public domain', creditRequired: false });
  });

  it('searches Pexels with the key, and never sends the key anywhere else', async () => {
    const fetchFn = jest.fn(async () =>
      json({
        photos: [
          {
            id: 42,
            width: 5000,
            height: 3000,
            url: 'https://www.pexels.com/photo/42/',
            photographer: 'Sam Lee',
            alt: 'A lecture hall',
            src: {
              large2x: 'https://images.pexels.com/photos/42/large2x.jpeg',
              medium: 'https://images.pexels.com/photos/42/medium.jpeg',
            },
          },
          { id: 43, src: { large: 'ftp://nope' } },
        ],
      }),
    );
    const out = await make(fetchFn, 'secret-key-1234').search('pexels', 'lecture hall');
    const [url, init] = fetchFn.mock.calls[0] as any[];
    expect(String(url)).toMatch(/^https:\/\/api\.pexels\.com\/v1\/search\?/);
    expect(init.headers.Authorization).toBe('secret-key-1234');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      provider: 'pexels',
      creditRequired: false,
      credit: 'Photo: Sam Lee · Pexels',
      imageUrl: 'https://images.pexels.com/photos/42/large2x.jpeg',
    });
    const ov = jest.fn(async () => json({ results: [] }));
    await make(ov, 'secret-key-1234').search('openverse', 'anything');
    expect(JSON.stringify(ov.mock.calls)).not.toContain('secret-key-1234');
  });

  it('refuses Pexels without a key, and short or long searches', async () => {
    const svc = make(jest.fn());
    await expect(svc.search('pexels', 'campus')).rejects.toThrow(/PEXELS_API_KEY/);
    await expect(svc.search('openverse', 'a')).rejects.toThrow(/2 to 100/);
    await expect(svc.search('openverse', 'x'.repeat(101))).rejects.toThrow(/2 to 100/);
  });

  it('turns outside failures into clear answers', async () => {
    const e = (f: any) => make(f).search('openverse', 'campus');
    await expect(e(jest.fn().mockRejectedValue(new Error('offline')))).rejects.toThrow(
      /not available right now/,
    );
    await expect(e(jest.fn(async () => json({}, 500)))).rejects.toThrow(/not available right now/);
    await expect(e(jest.fn(async () => new Response('<html>', { status: 200 })))).rejects.toThrow(
      /not available right now/,
    );
    const busy = await e(jest.fn(async () => json({}, 429))).catch((x) => x);
    expect(busy.getStatus()).toBe(429);
  });
});

describe('importing a free picture', () => {
  const png = async (w: number, h: number) =>
    sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 30, b: 30 } } })
      .png()
      .toBuffer();
  const saved: any[] = [];
  const media = {
    addProcessed: jest.fn(async (_o: string, _u: string, f: any) => {
      saved.push(f);
      return { id: 'asset-1', filename: f.filename, mimeType: f.mimeType };
    }),
  };
  const make = (bytes: Buffer | (() => Promise<Buffer>), seen: string[] = []) =>
    new StockImagesService(media as any, {
      download: async (url: string) => {
        seen.push(url);
        const b = typeof bytes === 'function' ? await bytes() : bytes;
        return { finalUrl: url, contentType: 'image/png', bytes: new Uint8Array(b) };
      },
    });
  beforeEach(() => {
    saved.length = 0;
    media.addProcessed.mockClear();
  });

  it('scales to 1600 wide, converts to WebP and names the file after the picture', async () => {
    const seen: string[] = [];
    const r = await make(await png(2400, 1200), seen).import(ORG, U_EDITOR, {
      imageUrl: 'https://live.staticflickr.com/1/photo.jpg',
      title: 'Students on Campus — Rabat!',
    });
    expect(seen).toEqual(['https://live.staticflickr.com/1/photo.jpg']);
    expect(r.width).toBe(1600);
    expect(r.height).toBe(800);
    expect(saved[0].filename).toBe('students-on-campus-rabat.webp');
    expect(saved[0].mimeType).toBe('image/webp');
    const meta = await sharp(saved[0].buffer).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(1600);
    expect(r.asset.id).toBe('asset-1');
  });

  it('never makes a small picture bigger, and strips hidden camera and location data', async () => {
    const withExif = await sharp({
      create: { width: 800, height: 600, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .withMetadata({ exif: { IFD0: { Copyright: 'someone', Make: 'camera' } } })
      .jpeg()
      .toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeDefined();
    const r = await make(withExif).import(ORG, U_EDITOR, {
      imageUrl: 'https://a.example/x.jpg',
      title: 't',
    });
    expect(r.width).toBe(800);
    expect((await sharp(saved[0].buffer).metadata()).exif).toBeUndefined();
  });

  it('turns an upright-flagged phone picture the right way up', async () => {
    const sideways = await sharp({
      create: { width: 1000, height: 400, channels: 3, background: { r: 9, g: 9, b: 9 } },
    })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    const r = await make(sideways).import(ORG, U_EDITOR, {
      imageUrl: 'https://a.example/x.jpg',
      title: 't',
    });
    expect([r.width, r.height]).toEqual([400, 1000]);
  });

  it('rejects addresses that are not https, bytes that are not a picture, and tiny pictures', async () => {
    const svc = make(await png(1000, 500));
    await expect(
      svc.import(ORG, U_EDITOR, { imageUrl: 'http://a.example/x.png', title: 't' }),
    ).rejects.toThrow(/https/);
    await expect(
      svc.import(ORG, U_EDITOR, { imageUrl: 'javascript:alert(1)', title: 't' }),
    ).rejects.toThrow(/https/);
    await expect(
      make(Buffer.from('<svg onload=alert(1)></svg>')).import(ORG, U_EDITOR, {
        imageUrl: 'https://a.example/x.png',
        title: 't',
      }),
    ).rejects.toThrow(/not a PNG, JPEG, WebP or GIF/);
    await expect(
      make(await png(200, 200)).import(ORG, U_EDITOR, {
        imageUrl: 'https://a.example/x.png',
        title: 't',
      }),
    ).rejects.toThrow(/too small/);
    // looks like a PNG at the start, but is not one
    const broken = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from('garbage'),
    ]);
    await expect(
      make(broken).import(ORG, U_EDITOR, { imageUrl: 'https://a.example/x.png', title: 't' }),
    ).rejects.toThrow(/could not be read/);
    expect(media.addProcessed).not.toHaveBeenCalled();
  });

  it('falls back to a plain file name', async () => {
    await make(await png(900, 600)).import(ORG, U_EDITOR, {
      imageUrl: 'https://a.example/x.png',
      title: '!!!',
    });
    expect(saved[0].filename).toBe('picture.webp');
  });
});

describe('picture search API', () => {
  let app: INestApplication;
  let memberships: { userId: string; organizationId: string; role: Role }[];
  const fake = {
    providers: jest.fn(() => [
      { id: 'openverse', name: 'Openverse', available: true, needsKey: false },
    ]),
    search: jest.fn(async () => [{ id: 'x' }]),
    import: jest.fn(async () => ({ asset: { id: 'a' }, width: 10, height: 10 })),
  };
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
  };
  const as = (id: string) => `Bearer user:${id}`;
  const base = `/api/organizations/${ORG}/stock-images`;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(StockImagesService)
      .useValue(fake)
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
  beforeEach(() => {
    memberships = [
      { userId: U_EDITOR, organizationId: ORG, role: Role.EDITOR },
      { userId: U_VIEWER, organizationId: ORG, role: Role.VIEWER },
    ];
    fake.search.mockClear();
    fake.import.mockClear();
  });

  it('is for people who may add to the media library, in their own organization only', async () => {
    await request(app.getHttpServer()).get(`${base}?q=campus`).expect(401);
    await request(app.getHttpServer())
      .get(`${base}?q=campus`)
      .set('Authorization', as(U_VIEWER))
      .expect(403);
    await request(app.getHttpServer())
      .get(`${base}?q=campus`)
      .set('Authorization', as(U_OTHER))
      .expect(404);
    await request(app.getHttpServer())
      .post(`${base}/import`)
      .set('Authorization', as(U_VIEWER))
      .send({ imageUrl: 'https://a.example/x.png' })
      .expect(403);
    await request(app.getHttpServer())
      .get(`${base}/providers`)
      .set('Authorization', as(U_EDITOR))
      .expect(200);
  });

  it('checks the search and the import before doing anything', async () => {
    const get = (qs: string) =>
      request(app.getHttpServer()).get(`${base}${qs}`).set('Authorization', as(U_EDITOR));
    await get('').expect(400);
    await get('?q=a').expect(400);
    await get('?q=campus&provider=getty').expect(400);
    await get('?q=campus&page=0').expect(400);
    await get('?q=campus&page=51').expect(400);
    expect(fake.search).not.toHaveBeenCalled();
    await get('?q=%20campus%20life%20&page=3').expect(200);
    expect(fake.search).toHaveBeenCalledWith('openverse', 'campus life', 3);

    const post = (b: object) =>
      request(app.getHttpServer())
        .post(`${base}/import`)
        .set('Authorization', as(U_EDITOR))
        .send(b);
    await post({}).expect(400);
    await post({ imageUrl: 'not a url' }).expect(400);
    expect(fake.import).not.toHaveBeenCalled();
    await post({ imageUrl: 'https://a.example/x.png', title: 'Campus' }).expect(201);
    expect(fake.import).toHaveBeenCalledWith(ORG, U_EDITOR, {
      imageUrl: 'https://a.example/x.png',
      title: 'Campus',
    });
  });
});
