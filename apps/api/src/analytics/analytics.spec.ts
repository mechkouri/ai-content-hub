import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../app.module';
import { TOKEN_VERIFIER } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService } from './analytics.service';

const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';
const U_VIEWER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const U_OTHER = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const CH1 = 'c1111111-1111-4111-8111-111111111111';
const CH2 = 'c2222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-11-13T12:00:00Z');
const at = (iso: string) => new Date(iso);

let pieces: any[];
let reviews: any[];
let jobs: any[];
let channels: any[];
let memberships: { userId: string; organizationId: string; role: Role }[];

const matches = (row: any, where: any): boolean =>
  Object.entries(where ?? {}).every(([k, v]: [string, any]) => {
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      if ('gte' in v) return row[k] >= v.gte;
      if ('in' in v) return v.in.includes(row[k]);
    }
    return row[k] === v;
  });
const table = (rows: () => any[]) => ({
  findMany: jest.fn(async ({ where, orderBy }: any) => {
    const hit = rows().filter((r) => matches(r, where));
    return orderBy?.createdAt === 'asc' ? hit.sort((a, b) => +a.createdAt - +b.createdAt) : hit;
  }),
});

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
  contentPiece: table(() => pieces),
  contentReview: table(() => reviews),
  publishJob: table(() => jobs),
  channel: table(() => channels),
};

beforeEach(() => {
  memberships = [
    { userId: U_VIEWER, organizationId: ORG_A, role: Role.VIEWER },
    { userId: U_OTHER, organizationId: ORG_B, role: Role.OWNER },
  ];
  channels = [
    { id: CH1, organizationId: ORG_A, name: 'Company website', provider: 'WORDPRESS' },
    { id: CH2, organizationId: ORG_A, name: 'LinkedIn', provider: 'LINKEDIN' },
    { id: 'cx', organizationId: ORG_B, name: 'Other org channel', provider: 'TEST' },
  ];
  const piece = (
    id: string,
    org: string,
    kind: string,
    language: string,
    created: string,
    approvalStatus: string,
  ) => ({
    id,
    organizationId: org,
    kind,
    language,
    createdAt: at(created),
    approvalStatus,
  });
  pieces = [
    piece('p1', ORG_A, 'ARTICLE', 'fr', '2026-11-08T09:00:00Z', 'DRAFT'),
    piece('p2', ORG_A, 'INSTAGRAM', 'fr', '2026-11-10T09:00:00Z', 'IN_REVIEW'),
    piece('p3', ORG_A, 'FACEBOOK', 'ar', '2026-11-12T09:00:00Z', 'APPROVED'),
    piece('old', ORG_A, 'ARTICLE', 'en', '2026-10-01T09:00:00Z', 'CHANGES_REQUESTED'), // before the period
    piece('p4', ORG_A, 'LINKEDIN', 'en', '2026-11-12T10:00:00Z', 'DRAFT'),
    piece('foreign', ORG_B, 'ARTICLE', 'en', '2026-11-12T09:00:00Z', 'APPROVED'),
  ];
  const review = (contentId: string, action: string, when: string, org = ORG_A) => ({
    id: `${contentId}-${action}-${when}`,
    organizationId: org,
    contentId,
    action,
    createdAt: at(when),
  });
  reviews = [
    review('p2', 'SUBMITTED', '2026-11-10T10:00:00Z'),
    review('p2', 'APPROVED', '2026-11-10T16:00:00Z'), // 6 h
    review('p3', 'SUBMITTED', '2026-11-11T08:00:00Z'),
    review('p3', 'APPROVED', '2026-11-12T10:00:00Z'), // 26 h
    review('p1', 'SUBMITTED', '2026-11-12T08:00:00Z'), // never approved: not counted
    review('p4', 'APPROVED', '2026-11-12T11:00:00Z'), // approved with no submission in the period: not counted
    review('p2', 'SUBMITTED', '2026-09-01T08:00:00Z'), // before the period
    review('foreign', 'SUBMITTED', '2026-11-12T08:00:00Z', ORG_B),
    review('foreign', 'APPROVED', '2026-11-12T09:00:00Z', ORG_B),
  ];
  const job = (
    id: string,
    org: string,
    channelId: string,
    status: string,
    created: string,
    extra: Record<string, unknown> = {},
  ) => ({
    id,
    organizationId: org,
    contentId: 'p3',
    channelId,
    status,
    createdAt: at(created),
    updatedAt: at(created),
    publishedAt: null,
    lastError: null,
    ...extra,
  });
  jobs = [
    job('j1', ORG_A, CH1, 'PUBLISHED', '2026-11-12T08:00:00Z', {
      publishedAt: at('2026-11-12T08:05:00Z'),
    }),
    job('j2', ORG_A, CH1, 'PUBLISHED', '2026-11-12T09:00:00Z', {
      publishedAt: at('2026-11-12T09:05:00Z'),
    }),
    job('j3', ORG_A, CH2, 'PUBLISHED', '2026-11-13T07:00:00Z', {
      publishedAt: at('2026-11-13T07:05:00Z'),
    }),
    job('j4', ORG_A, CH1, 'FAILED', '2026-11-11T08:00:00Z', {
      updatedAt: at('2026-11-12T10:00:00Z'),
      lastError: 'WordPress refused the post',
    }),
    job('j5', ORG_A, CH2, 'QUEUED', '2026-11-13T08:00:00Z'),
    job('j6', ORG_A, CH2, 'CANCELLED', '2026-11-13T08:00:00Z'),
    job('j-old', ORG_A, CH1, 'PUBLISHED', '2026-09-01T08:00:00Z', {
      publishedAt: at('2026-09-01T08:05:00Z'),
    }), // before the period
    job('j-foreign', ORG_B, 'cx', 'PUBLISHED', '2026-11-12T08:00:00Z', {
      publishedAt: at('2026-11-12T08:05:00Z'),
    }),
  ];
});

describe('analytics numbers', () => {
  const svc = () => new AnalyticsService(prismaMock);

  it('counts exactly what happened in the period, for this organization only', async () => {
    const r = await svc().overview(ORG_A, 7, NOW);
    expect(r.range).toEqual({ days: 7, from: '2026-11-07', to: '2026-11-13' });
    expect(r.totals).toEqual({ created: 4, published: 3, failed: 1, queued: 1 });
    expect(r.successRate).toBe(75); // 3 of 4 that finished
    expect(r.content.byKind).toEqual({ ARTICLE: 1, INSTAGRAM: 1, FACEBOOK: 1, LINKEDIN: 1 });
    expect(r.content.byLanguage).toEqual({ fr: 2, ar: 1, en: 1 });
  });

  it('shows where all content stands right now, not only this period', async () => {
    const r = await svc().overview(ORG_A, 7, NOW);
    expect(r.pipeline).toEqual({ draft: 2, inReview: 1, changesRequested: 1, approved: 1 });
  });

  it('measures the time from submission to approval', async () => {
    const r = await svc().overview(ORG_A, 7, NOW);
    expect(r.approval).toEqual({ count: 2, avgMinutes: 960 }); // (6 h + 26 h) / 2 = 16 h
  });

  it('reports no average when nothing was approved in the period', async () => {
    reviews = [];
    const r = await svc().overview(ORG_A, 7, NOW);
    expect(r.approval).toEqual({ count: 0, avgMinutes: null });
  });

  it('gives one entry per day, zero-filled, with posts on the day they went out', async () => {
    const r = await svc().overview(ORG_A, 7, NOW);
    expect(r.byDay.map((d) => d.date)).toEqual([
      '2026-11-07',
      '2026-11-08',
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
    ]);
    expect(r.byDay.find((d) => d.date === '2026-11-12')).toEqual({
      date: '2026-11-12',
      published: 2,
      failed: 1,
    });
    expect(r.byDay.find((d) => d.date === '2026-11-13')).toEqual({
      date: '2026-11-13',
      published: 1,
      failed: 0,
    });
    expect(r.byDay.find((d) => d.date === '2026-11-09')).toEqual({
      date: '2026-11-09',
      published: 0,
      failed: 0,
    });
  });

  it('splits publishing by channel, best first, and lists recent failures with their reason', async () => {
    const r = await svc().overview(ORG_A, 7, NOW);
    expect(r.byChannel).toEqual([
      {
        channelId: CH1,
        name: 'Company website',
        provider: 'WORDPRESS',
        published: 2,
        failed: 1,
        queued: 0,
      },
      {
        channelId: CH2,
        name: 'LinkedIn',
        provider: 'LINKEDIN',
        published: 1,
        failed: 0,
        queued: 1,
      },
    ]);
    expect(r.recentFailures).toEqual([
      {
        jobId: 'j4',
        contentId: 'p3',
        channel: 'Company website',
        error: 'WordPress refused the post',
        at: at('2026-11-12T10:00:00Z'),
      },
    ]);
  });

  it('handles an empty organization, a longer period and a removed channel', async () => {
    const empty = await svc().overview(ORG_B + '-none', 30, NOW);
    expect(empty.totals).toEqual({ created: 0, published: 0, failed: 0, queued: 0 });
    expect(empty.successRate).toBeNull();
    expect(empty.byDay).toHaveLength(30);
    expect(empty.byChannel).toEqual([]);

    const wide = await svc().overview(ORG_A, 90, NOW);
    expect(wide.byDay).toHaveLength(90);
    expect(wide.totals.created).toBe(5); // the October piece now counts
    expect(wide.totals.published).toBe(4); // so does the old post

    channels = channels.filter((c) => c.id !== CH2);
    const gone = await svc().overview(ORG_A, 7, NOW);
    expect(gone.byChannel.find((c) => c.channelId === CH2)).toMatchObject({
      name: 'Removed channel',
      provider: null,
    });
  });
});

describe('analytics API', () => {
  let app: INestApplication;
  const as = (id: string) => `Bearer user:${id}`;
  const url = `/api/organizations/${ORG_A}/analytics`;

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

  it('defaults to 30 days and accepts only the offered periods', async () => {
    const def = await request(app.getHttpServer())
      .get(url)
      .set('Authorization', as(U_VIEWER))
      .expect(200);
    expect(def.body.range.days).toBe(30);
    expect(def.body.byDay).toHaveLength(30);
    for (const d of [7, 90]) {
      const r = await request(app.getHttpServer())
        .get(`${url}?days=${d}`)
        .set('Authorization', as(U_VIEWER))
        .expect(200);
      expect(r.body.range.days).toBe(d);
    }
    for (const bad of ['5', '365', 'abc', '-7', '7.5']) {
      await request(app.getHttpServer())
        .get(`${url}?days=${bad}`)
        .set('Authorization', as(U_VIEWER))
        .expect(400);
    }
  });

  it('is readable by every member, and invisible to other organizations and visitors', async () => {
    await request(app.getHttpServer()).get(url).set('Authorization', as(U_OTHER)).expect(404);
    await request(app.getHttpServer()).get(url).expect(401);
    await request(app.getHttpServer())
      .get(`/api/organizations/not-a-uuid/analytics`)
      .set('Authorization', as(U_VIEWER))
      .expect(404);
    const mine = await request(app.getHttpServer())
      .get(url)
      .set('Authorization', as(U_VIEWER))
      .expect(200);
    expect(JSON.stringify(mine.body)).not.toContain('Other org channel');
  });
});
