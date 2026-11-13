import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { AppModule } from '../app.module';
import { TOKEN_VERIFIER } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { MAX_TEMPLATES_PER_ORG } from './design.service';

const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';
const U_DESIGNER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const U_VIEWER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const U_OTHER = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

let templates: any[];
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
  designTemplate: {
    findMany: jest.fn(async ({ where }: any) =>
      templates.filter((t) => t.organizationId === where.organizationId),
    ),
    count: jest.fn(
      async ({ where }: any) =>
        templates.filter((t) => t.organizationId === where.organizationId).length,
    ),
    create: jest.fn(async ({ data }: any) => {
      const t = { id: randomUUID(), createdAt: new Date(), updatedAt: new Date(), ...data };
      templates.push(t);
      return t;
    }),
    findFirst: jest.fn(
      async ({ where }: any) =>
        templates.find((t) => t.id === where.id && t.organizationId === where.organizationId) ??
        null,
    ),
    update: jest.fn(async ({ where, data }: any) =>
      Object.assign(
        templates.find((t) => t.id === where.id),
        data,
      ),
    ),
    delete: jest.fn(async ({ where }: any) => {
      templates = templates.filter((t) => t.id !== where.id);
    }),
  },
};

const el = (over: Record<string, unknown> = {}) => ({
  id: 'abc12345',
  type: 'text',
  x: 80,
  y: 120,
  w: 600,
  h: 120,
  rotation: 0,
  opacity: 1,
  text: 'Meet our teachers',
  font: 'heading',
  size: 72,
  bold: true,
  italic: false,
  uppercase: false,
  color: 'white',
  align: 'left',
  lineHeight: 1.18,
  letterSpacing: 0,
  box: null,
  boxRadius: 0,
  padding: 0,
  ...over,
});

/** A whole page: a background, a shape and a text. */
const spec = (over: Record<string, unknown> = {}) => ({
  format: 'square',
  background: 'primary',
  elements: [
    {
      id: 'shape001',
      type: 'shape',
      shape: 'rect',
      x: 0,
      y: 0,
      w: 1080,
      h: 200,
      rotation: 0,
      opacity: 1,
      fill: '#ff8800',
      radius: 0,
      stroke: null,
      strokeWidth: 0,
    },
    el(),
    { id: 'logo0001', type: 'logo', x: 40, y: 40, w: 140, h: 140, rotation: -12.5, opacity: 0.9 },
  ],
  ...over,
});

describe('design templates API', () => {
  let app: INestApplication;
  const as = (id: string) => `Bearer user:${id}`;
  const base = `/api/organizations/${ORG_A}/design-templates`;

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

  beforeEach(() => {
    templates = [];
    memberships = [
      { userId: U_DESIGNER, organizationId: ORG_A, role: Role.DESIGNER },
      { userId: U_VIEWER, organizationId: ORG_A, role: Role.VIEWER },
      { userId: U_OTHER, organizationId: ORG_B, role: Role.OWNER },
    ];
  });

  const create = (body: object, user = U_DESIGNER) =>
    request(app.getHttpServer()).post(base).set('Authorization', as(user)).send(body);

  it('creates, lists, renames and deletes a template', async () => {
    const made = await create({ name: '  Open day  ', category: 'education', spec: spec() }).expect(
      201,
    );
    expect(made.body.name).toBe('Open day');
    expect(made.body.createdById).toBe(U_DESIGNER);
    expect(made.body.spec.elements[1].text).toBe('Meet our teachers');

    const list = await request(app.getHttpServer())
      .get(base)
      .set('Authorization', as(U_VIEWER))
      .expect(200);
    expect(list.body).toHaveLength(1);

    const renamed = await request(app.getHttpServer())
      .patch(`${base}/${made.body.id}`)
      .set('Authorization', as(U_DESIGNER))
      .send({ name: 'Open day 2027', spec: spec({ format: 'portrait' }) })
      .expect(200);
    expect(renamed.body.name).toBe('Open day 2027');
    expect(renamed.body.spec.format).toBe('portrait');

    await request(app.getHttpServer())
      .delete(`${base}/${made.body.id}`)
      .set('Authorization', as(U_DESIGNER))
      .expect(200);
    expect(templates).toHaveLength(0);
  });

  it('lets everyone read but only designers, editors and admins write', async () => {
    await create({ name: 'Nope', category: 'quote', spec: spec() }, U_VIEWER).expect(403);
    const t = await create({ name: 'Mine', category: 'quote', spec: spec() }).expect(201);
    await request(app.getHttpServer())
      .delete(`${base}/${t.body.id}`)
      .set('Authorization', as(U_VIEWER))
      .expect(403);
    await request(app.getHttpServer()).get(base).expect(401);
  });

  it('keeps templates private to their organization', async () => {
    const t = await create({ name: 'Mine', category: 'event', spec: spec() }).expect(201);
    await request(app.getHttpServer()).get(base).set('Authorization', as(U_OTHER)).expect(404);
    // A member of another organization cannot reach this one's template through their own org either.
    const otherBase = `/api/organizations/${ORG_B}/design-templates`;
    await request(app.getHttpServer())
      .patch(`${otherBase}/${t.body.id}`)
      .set('Authorization', as(U_OTHER))
      .send({ name: 'Hijacked' })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`${otherBase}/${t.body.id}`)
      .set('Authorization', as(U_OTHER))
      .expect(404);
    expect(templates[0].name).toBe('Mine');
  });

  it('rejects anything that is not a valid template', async () => {
    const bad: object[] = [
      { name: 'x', category: 'education', spec: spec() }, // name too short
      { name: 'Fine', category: 'cooking', spec: spec() }, // unknown category
      { name: 'Fine', category: 'education', spec: spec({ format: 'huge' }) },
      { name: 'Fine', category: 'education', spec: spec({ background: 'red; drop table' }) },
      { name: 'Fine', category: 'education', spec: spec({ elements: [el({ type: 'video' })] }) },
      {
        name: 'Fine',
        category: 'education',
        spec: spec({ elements: [el({ text: 'x'.repeat(601) })] }),
      },
      {
        name: 'Fine',
        category: 'education',
        spec: spec({ elements: [el({ font: 'Comic Sans' })] }),
      },
      { name: 'Fine', category: 'education', spec: spec({ elements: [el({ opacity: 3 })] }) },
      { name: 'Fine', category: 'education', spec: spec({ elements: [el({ x: 'NaN' })] }) },
      {
        name: 'Fine',
        category: 'education',
        spec: spec({ elements: [el({ color: 'url(javascript:1)' })] }),
      },
      { name: 'Fine', category: 'education', spec: spec({ elements: [el({ script: '<b>' })] }) }, // extra field
      {
        name: 'Fine',
        category: 'education',
        spec: spec({
          elements: [
            {
              id: 'img00001',
              type: 'image',
              assetId: 'not-a-uuid',
              x: 0,
              y: 0,
              w: 10,
              h: 10,
              rotation: 0,
              opacity: 1,
              fit: 'cover',
              radius: 0,
            },
          ],
        }),
      },
      { name: 'Fine', category: 'education', spec: { ...spec(), extra: true } },
      {
        name: 'Fine',
        category: 'education',
        spec: spec({ elements: Array.from({ length: 81 }, (_, i) => el({ id: `e${i}` })) }),
      },
      { name: 'Fine', category: 'education' },
    ];
    for (const body of bad) await create(body).expect(400);
    expect(templates).toHaveLength(0);
  });

  it('keeps every kind of element exactly as it was designed', async () => {
    const asset = '33333333-3333-4333-8333-333333333333';
    const full = spec({
      background: '#112233',
      elements: [
        {
          id: 'img00001',
          type: 'image',
          assetId: asset,
          x: -50,
          y: 0,
          w: 1180,
          h: 700,
          rotation: 5,
          opacity: 0.8,
          fit: 'contain',
          radius: 24,
        },
        {
          id: 'grad0001',
          type: 'shape',
          shape: 'gradient',
          x: 0,
          y: 500,
          w: 1080,
          h: 580,
          rotation: 0,
          opacity: 0.8,
          fill: 'dark',
          radius: 0,
          stroke: null,
          strokeWidth: 0,
        },
        {
          id: 'circ0001',
          type: 'shape',
          shape: 'ellipse',
          x: 10,
          y: 10,
          w: 90,
          h: 90,
          rotation: 0,
          opacity: 1,
          fill: 'accent',
          radius: 0,
          stroke: 'white',
          strokeWidth: 4,
          locked: true,
        },
        el({
          id: 'btn00001',
          box: 'accent',
          boxRadius: 60,
          padding: 28,
          align: 'center',
          uppercase: true,
          italic: true,
          font: 'Cairo',
          text: 'سجّل الآن',
        }),
      ],
    });
    const made = await create({ name: 'Everything', category: 'promotion', spec: full }).expect(
      201,
    );
    expect(made.body.spec).toEqual(full);
  });

  it('allows a blank page', async () => {
    const t = await create({
      name: 'Blank',
      category: 'other',
      spec: { format: 'story', background: 'white', elements: [] },
    }).expect(201);
    expect(t.body.spec.elements).toEqual([]);
  });

  it('stops at the limit per organization', async () => {
    for (let i = 0; i < MAX_TEMPLATES_PER_ORG; i++) {
      templates.push({ id: randomUUID(), organizationId: ORG_A, name: `T${i}`, category: 'other' });
    }
    const res = await create({ name: 'One more', category: 'other', spec: spec() }).expect(409);
    expect(String(res.body.message)).toMatch(/up to 50 templates/);
  });

  it('answers 404 for an unknown template and for a malformed id', async () => {
    await request(app.getHttpServer())
      .patch(`${base}/${randomUUID()}`)
      .set('Authorization', as(U_DESIGNER))
      .send({ name: 'Anything' })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`${base}/not-an-id`)
      .set('Authorization', as(U_DESIGNER))
      .expect(404);
  });
});
