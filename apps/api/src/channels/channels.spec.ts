import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { AppModule } from '../app.module';
import { TOKEN_VERIFIER } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { randomBytes } from 'crypto';
import { PermanentPublishError, PUBLISHERS } from './publisher';
import { STORAGE } from '../storage/storage';
import { HTTP_CLIENT } from './safe-request';
import { PublishingService } from './publishing.service';
import { checkPost, renderPost } from './publishing-rules';

const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';
const U_ADMIN = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const U_PUBLISHER = '99999999-9999-4999-8999-999999999999';
const U_EDITOR = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const U_VIEWER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const U_OTHER = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

// ---------- pure rules ----------
describe('publishing rules', () => {
  const insta = (over: Record<string, unknown> = {}) => ({
    caption: 'Open Day on 14 March!',
    cta: 'Register now',
    hashtags: ['OpenDay', '#Atlas', 'Rabat Campus'],
    ...over,
  });

  it('renders the final text with call to action and normalized hashtags', () => {
    const p = renderPost('INSTAGRAM', 't', insta());
    expect(p.text).toBe('Open Day on 14 March!\n\nRegister now\n\n#OpenDay #Atlas #RabatCampus');
    const fb = renderPost('FACEBOOK', 't', {
      postText: 'Hello',
      cta: '',
      hashtags: [],
      link: 'https://a.example',
    });
    expect(fb.text).toBe('Hello');
    expect(fb.link).toBe('https://a.example');
    const art = renderPost('ARTICLE', 'fallback', {
      h1: 'Main title',
      introduction: 'Intro',
      sections: [{ heading: 'H', body: 'B' }],
      conclusion: 'End',
    });
    expect(art.title).toBe('Main title');
    expect(art.text).toBe('Intro\n\nH\n\nB\n\nEnd');
  });

  it('refuses what a network would reject and only advises on the rest', () => {
    const ok = insta();
    expect(checkPost('INSTAGRAM', ok, renderPost('INSTAGRAM', 't', ok)).errors).toEqual([]);

    // Fits alone, but not once the call to action and hashtags are added.
    const long = insta({ caption: 'x'.repeat(2150), cta: 'y'.repeat(60) });
    const r = checkPost('INSTAGRAM', long, renderPost('INSTAGRAM', 't', long));
    expect(r.errors[0]).toMatch(/2200/);

    const many = insta({ hashtags: Array.from({ length: 31 }, (_, i) => `tag${i}`) });
    expect(checkPost('INSTAGRAM', many, renderPost('INSTAGRAM', 't', many)).errors[0]).toMatch(
      /30 hashtags/,
    );
    const some = insta({ hashtags: Array.from({ length: 20 }, (_, i) => `tag${i}`) });
    const adv = checkPost('INSTAGRAM', some, renderPost('INSTAGRAM', 't', some));
    expect(adv.errors).toEqual([]);
    expect(adv.warnings.join(' ')).toMatch(/hashtags/);

    const li = { postText: 'z'.repeat(3001), cta: '', hashtags: [] };
    expect(checkPost('LINKEDIN', li, renderPost('LINKEDIN', 't', li)).errors[0]).toMatch(/3000/);

    const empty = { caption: '', cta: '', hashtags: [] };
    expect(checkPost('INSTAGRAM', empty, renderPost('INSTAGRAM', 't', empty)).errors[0]).toMatch(
      /no text/,
    );

    const art = { slug: '', h1: 'T', seoTitle: 'x'.repeat(70), metaDescription: 'm'.repeat(170) };
    const a = checkPost(
      'ARTICLE',
      art,
      renderPost('ARTICLE', 't', { ...art, sections: [], introduction: 'i' }),
    );
    expect(a.errors).toEqual(['The article needs a URL slug.']);
    expect(a.warnings.length).toBeGreaterThanOrEqual(3);
  });
});

// ---------- HTTP and worker with in-memory data ----------
let channels: any[];
let jobs: any[];
let pieces: any[];
let images: any[];
let stored: Map<string, Buffer>;
let memberships: { userId: string; organizationId: string; role: Role }[];

const matches = (row: any, where: any): boolean =>
  Object.entries(where ?? {}).every(([k, v]: [string, any]) => {
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      if ('lte' in v) return row[k] <= v.lte;
      if ('lt' in v) return row[k] < v.lt;
      if ('in' in v) return v.in.includes(row[k]);
    }
    return row[k] === v;
  });

const apply = (row: any, data: any) => {
  for (const [k, v] of Object.entries(data) as [string, any][]) {
    row[k] = v && typeof v === 'object' && 'increment' in v ? row[k] + v.increment : v;
  }
  row.updatedAt = new Date();
  return row;
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
  channel: {
    create: jest.fn(async ({ data }: any) => {
      const c = {
        id: randomUUID(),
        status: 'CONNECTED',
        config: {},
        lastError: null,
        createdAt: new Date(),
        ...data,
      };
      channels.push(c);
      return c;
    }),
    findMany: jest.fn(async ({ where }: any) => channels.filter((c) => matches(c, where))),
    findFirst: jest.fn(async ({ where }: any) => channels.find((c) => matches(c, where)) ?? null),
    update: jest.fn(async ({ where, data }: any) =>
      apply(
        channels.find((c) => c.id === where.id),
        data,
      ),
    ),
    delete: jest.fn(async ({ where }: any) => {
      channels = channels.filter((c) => c.id !== where.id);
      jobs = jobs.filter((j) => j.channelId !== where.id);
    }),
  },
  contentPiece: {
    findFirst: jest.fn(async ({ where }: any) => pieces.find((p) => matches(p, where)) ?? null),
    update: jest.fn(async ({ where, data }: any) =>
      Object.assign(
        pieces.find((p) => p.id === where.id),
        data,
      ),
    ),
  },
  contentImage: {
    findMany: jest.fn(async ({ where }: any) =>
      images.filter((i) => i.contentId === where.contentId).sort((a, b) => a.position - b.position),
    ),
  },
  publishJob: {
    create: jest.fn(async ({ data }: any) => {
      const j = {
        id: randomUUID(),
        attempts: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      };
      jobs.push(j);
      return j;
    }),
    findFirst: jest.fn(async ({ where }: any) => jobs.find((j) => matches(j, where)) ?? null),
    findMany: jest.fn(async ({ where, take }: any) =>
      jobs
        .filter((j) => matches(j, where))
        .sort((a, b) => +a.runAt - +b.runAt)
        .slice(0, take ?? 1000),
    ),
    update: jest.fn(async ({ where, data }: any) =>
      apply(
        jobs.find((j) => j.id === where.id),
        data,
      ),
    ),
    updateMany: jest.fn(async ({ where, data }: any) => {
      const hit = jobs.filter((j) => matches(j, where));
      hit.forEach((j) => apply(j, data));
      return { count: hit.length };
    }),
  },
};

describe('channels and publishing', () => {
  let app: INestApplication;
  let publishing: PublishingService;
  let sent: any[];
  // The WordPress site is simulated: each test decides how it answers.
  let wpHttp: (url: string, opts?: any) => Promise<{ status: number; json: any }>;
  const as = (id: string) => `Bearer user:${id}`;
  const base = `/api/organizations/${ORG_A}`;

  beforeAll(async () => {
    process.env.ENCRYPTION_KEY = randomBytes(32).toString('base64');
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(STORAGE)
      .useValue({
        put: async (k: string, d: Buffer) => void stored.set(k, d),
        get: async (k: string) => stored.get(k)!,
        delete: async (k: string) => void stored.delete(k),
      })
      .overrideProvider(HTTP_CLIENT)
      .useValue((url: string, opts?: any) => wpHttp(url, opts))
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
    publishing = app.get(PublishingService);
  });
  afterAll(async () => {
    delete process.env.ENCRYPTION_KEY;
    await app.close();
  });

  const piece = (over: Record<string, unknown> = {}) => {
    const p: any = {
      id: randomUUID(),
      organizationId: ORG_A,
      kind: 'FACEBOOK',
      title: 'Open Day',
      approvalStatus: 'APPROVED',
      scheduledFor: null,
      content: {
        postText: 'Open Day on 14 March at the Rabat campus.',
        cta: 'Register',
        hashtags: ['OpenDay'],
        link: null,
      },
      ...over,
    };
    pieces.push(p);
    return p;
  };

  beforeEach(() => {
    channels = [];
    jobs = [];
    pieces = [];
    images = [];
    stored = new Map();
    sent = [];
    memberships = [
      { userId: U_ADMIN, organizationId: ORG_A, role: Role.ADMIN },
      { userId: U_PUBLISHER, organizationId: ORG_A, role: Role.PUBLISHER },
      { userId: U_EDITOR, organizationId: ORG_A, role: Role.EDITOR },
      { userId: U_VIEWER, organizationId: ORG_A, role: Role.VIEWER },
      { userId: U_OTHER, organizationId: ORG_B, role: Role.OWNER },
    ];
    // Record what the test publisher is asked to send, and let each test make it fail.
    const test = (app.get(PUBLISHERS) as any[])[0];
    test.publish = jest.fn(async (_c: any, payload: any) => {
      sent.push(payload);
      return { externalId: `ext-${sent.length}`, url: 'https://example.test/p/' + sent.length };
    });
  });

  const makeChannel = async (name = 'Test channel', user = U_ADMIN) =>
    (
      await request(app.getHttpServer())
        .post(`${base}/channels`)
        .set('Authorization', as(user))
        .send({ provider: 'TEST', name })
        .expect(201)
    ).body;
  const queue = (body: object, user = U_PUBLISHER) =>
    request(app.getHttpServer())
      .post(`${base}/publishing/jobs`)
      .set('Authorization', as(user))
      .send(body);
  const jobAction = (id: string, action: string, user = U_PUBLISHER) =>
    request(app.getHttpServer())
      .post(`${base}/publishing/jobs/${id}/${action}`)
      .set('Authorization', as(user));

  describe('channels', () => {
    it('lists providers and creates only the ones that can publish', async () => {
      const prov = await request(app.getHttpServer())
        .get(`${base}/channels/providers`)
        .set('Authorization', as(U_VIEWER))
        .expect(200);
      expect(prov.body.find((p: any) => p.provider === 'TEST').available).toBe(true);
      expect(prov.body.find((p: any) => p.provider === 'INSTAGRAM').available).toBe(false);

      const c = await makeChannel('  My test  ');
      expect(c.name).toBe('My test');
      expect(c.status).toBe('CONNECTED');
      const res = await request(app.getHttpServer())
        .post(`${base}/channels`)
        .set('Authorization', as(U_ADMIN))
        .send({ provider: 'INSTAGRAM', name: 'Page' })
        .expect(400); // Instagram needs an account ID and a token, like every provider with a login
      expect(JSON.stringify(res.body)).toMatch(/igUserId|account ID/i);
      await request(app.getHttpServer())
        .post(`${base}/channels`)
        .set('Authorization', as(U_ADMIN))
        .send({ provider: 'TEST', name: 'x' })
        .expect(400);
    });

    it('is managed by admins, readable by everyone, and private to the organization', async () => {
      await request(app.getHttpServer())
        .post(`${base}/channels`)
        .set('Authorization', as(U_EDITOR))
        .send({ provider: 'TEST', name: 'Nope' })
        .expect(403);
      const c = await makeChannel();
      await request(app.getHttpServer())
        .get(`${base}/channels`)
        .set('Authorization', as(U_VIEWER))
        .expect(200);
      await request(app.getHttpServer())
        .get(`${base}/channels`)
        .set('Authorization', as(U_OTHER))
        .expect(404);
      await request(app.getHttpServer())
        .patch(`${base}/channels/${c.id}`)
        .set('Authorization', as(U_OTHER))
        .send({ name: 'Hijack' })
        .expect(404);
      await request(app.getHttpServer())
        .patch(`${base}/channels/not-a-uuid`)
        .set('Authorization', as(U_ADMIN))
        .send({ name: 'Renamed' })
        .expect(404);
      await request(app.getHttpServer()).get(`${base}/channels`).expect(401);
    });

    it('cancels waiting posts when a channel is disconnected, and removes jobs with a deleted channel', async () => {
      const c = await makeChannel();
      const p = piece();
      await queue({ contentId: p.id, channelIds: [c.id], when: 'now' }).expect(201);
      await request(app.getHttpServer())
        .patch(`${base}/channels/${c.id}`)
        .set('Authorization', as(U_ADMIN))
        .send({ status: 'DISCONNECTED' })
        .expect(200);
      expect(jobs[0].status).toBe('CANCELLED');
      await queue({ contentId: p.id, channelIds: [c.id], when: 'now' }).expect(409); // not connected
      await request(app.getHttpServer())
        .delete(`${base}/channels/${c.id}`)
        .set('Authorization', as(U_ADMIN))
        .expect(200);
      expect(jobs).toHaveLength(0);
    });
  });

  describe('queueing', () => {
    it('queues approved content for several channels and warns about weak spots', async () => {
      const a = await makeChannel('Channel A');
      const b = await makeChannel('Channel B');
      const p = piece({
        content: { postText: 'x'.repeat(900), cta: '', hashtags: [], link: null },
      });
      const res = await queue({
        contentId: p.id,
        channelIds: [a.id, b.id, a.id],
        when: 'now',
      }).expect(201);
      expect(res.body.jobs).toHaveLength(2); // duplicate channel id ignored
      expect(res.body.jobs[0].status).toBe('QUEUED');
      expect(res.body.warnings.join(' ')).toMatch(/Shorter Facebook/);
      expect(res.body.jobs[0].payload.text).toHaveLength(900);
    });

    it('only publishes approved content and refuses invalid posts, creating nothing', async () => {
      const c = await makeChannel();
      const draft = piece({ approvalStatus: 'DRAFT' });
      await queue({ contentId: draft.id, channelIds: [c.id], when: 'now' }).expect(409);

      const tooLong = piece({
        kind: 'LINKEDIN',
        content: { postText: 'z'.repeat(3100), cta: '', hashtags: [] },
      });
      const res = await queue({ contentId: tooLong.id, channelIds: [c.id], when: 'now' }).expect(
        422,
      );
      expect(res.body.errors[0]).toMatch(/3000/);

      const ok = piece();
      const other = await request(app.getHttpServer())
        .post(`${base}/publishing/jobs`)
        .set('Authorization', as(U_PUBLISHER))
        .send({ contentId: ok.id, channelIds: [c.id, randomUUID()], when: 'now' })
        .expect(404); // one unknown channel: all or nothing
      expect(other.body.message).toMatch(/Channel not found/);
      expect(jobs).toHaveLength(0);
    });

    it('needs a future schedule for "scheduled" and follows the date when it changes', async () => {
      const c = await makeChannel();
      const p = piece();
      await queue({ contentId: p.id, channelIds: [c.id], when: 'scheduled' }).expect(409); // no date
      p.scheduledFor = new Date(Date.now() - 60_000);
      await queue({ contentId: p.id, channelIds: [c.id], when: 'scheduled' }).expect(409); // past
      const at = new Date(Date.now() + 3_600_000);
      p.scheduledFor = at;
      const res = await queue({ contentId: p.id, channelIds: [c.id], when: 'scheduled' }).expect(
        201,
      );
      expect(new Date(res.body.jobs[0].runAt).getTime()).toBe(at.getTime());

      const later = new Date(Date.now() + 7_200_000);
      await publishing.rescheduleForContent(p.id, later);
      expect(jobs[0].runAt).toEqual(later);
      await publishing.cancelScheduledForContent(p.id);
      expect(jobs[0].status).toBe('CANCELLED');
    });

    it('never queues the same content to the same channel twice', async () => {
      const c = await makeChannel();
      const p = piece();
      await queue({ contentId: p.id, channelIds: [c.id], when: 'now' }).expect(201);
      await queue({ contentId: p.id, channelIds: [c.id], when: 'now' }).expect(409); // waiting
      await publishing.processDue();
      expect(jobs[0].status).toBe('PUBLISHED');
      await queue({ contentId: p.id, channelIds: [c.id], when: 'now' }).expect(409); // already published
      expect(jobs).toHaveLength(1);
    });

    it('requires the publish permission and the right organization', async () => {
      const c = await makeChannel();
      const p = piece();
      const body = { contentId: p.id, channelIds: [c.id], when: 'now' };
      await queue(body, U_EDITOR).expect(403);
      await queue(body, U_VIEWER).expect(403);
      await queue(body, U_OTHER).expect(404);
      await queue({ contentId: 'nope', channelIds: [c.id], when: 'now' }).expect(400);
      await queue(body, U_ADMIN).expect(201);
    });
  });

  describe('the worker', () => {
    it('publishes only what is due, with the approved text, and records the result', async () => {
      const c = await makeChannel();
      const now = piece();
      const later = piece({ scheduledFor: new Date(Date.now() + 3_600_000) });
      await queue({ contentId: now.id, channelIds: [c.id], when: 'now' }).expect(201);
      await queue({ contentId: later.id, channelIds: [c.id], when: 'scheduled' }).expect(201);

      const r = await publishing.processDue();
      expect(r).toEqual({ due: 1, published: 1 });
      const done = jobs.find((j) => j.contentId === now.id);
      expect(done.status).toBe('PUBLISHED');
      expect(done.externalId).toBe('ext-1');
      expect(done.externalUrl).toBe('https://example.test/p/1');
      expect(done.publishedAt).toBeInstanceOf(Date);
      expect(sent[0].text).toContain('Open Day on 14 March');
      expect(jobs.find((j) => j.contentId === later.id).status).toBe('QUEUED');

      // When its time comes, the scheduled one goes out too, and nothing is sent twice.
      const r2 = await publishing.processDue(new Date(Date.now() + 2 * 3_600_000));
      expect(r2.published).toBe(1);
      expect((await publishing.processDue(new Date(Date.now() + 3 * 3_600_000))).due).toBe(0);
      expect(sent).toHaveLength(2);
    });

    it('retries transient failures with a delay, then gives up after three attempts', async () => {
      const c = await makeChannel();
      const p = piece();
      await queue({ contentId: p.id, channelIds: [c.id], when: 'now' }).expect(201);
      const test = (app.get(PUBLISHERS) as any[])[0];
      test.publish = jest.fn(async () => {
        throw new Error('Network timeout');
      });

      const t0 = new Date();
      await publishing.processDue(t0);
      expect(jobs[0].status).toBe('QUEUED');
      expect(jobs[0].attempts).toBe(1);
      expect(jobs[0].lastError).toBe('Network timeout');
      expect(jobs[0].runAt.getTime()).toBe(t0.getTime() + 5 * 60_000);

      expect((await publishing.processDue(new Date(t0.getTime() + 60_000))).due).toBe(0); // not yet
      await publishing.processDue(new Date(t0.getTime() + 6 * 60_000));
      expect(jobs[0].attempts).toBe(2);
      await publishing.processDue(new Date(t0.getTime() + 30 * 60_000));
      expect(jobs[0].status).toBe('FAILED');
      expect(jobs[0].attempts).toBe(3);
      expect(test.publish).toHaveBeenCalledTimes(3);

      // A person can retry it once the problem is fixed.
      test.publish = jest.fn(async () => ({ externalId: 'ok-1', url: null }));
      await jobAction(jobs[0].id, 'retry').expect(201);
      await publishing.processDue(new Date(Date.now() + 1000));
      expect(jobs[0].status).toBe('PUBLISHED');
    });

    it('does not retry failures that cannot succeed', async () => {
      const c = await makeChannel();
      const p = piece();
      await queue({ contentId: p.id, channelIds: [c.id], when: 'now' }).expect(201);
      (app.get(PUBLISHERS) as any[])[0].publish = jest.fn(async () => {
        throw new PermanentPublishError('The network rejected this post');
      });
      await publishing.processDue();
      expect(jobs[0].status).toBe('FAILED');
      expect(jobs[0].attempts).toBe(1);
      expect(jobs[0].lastError).toBe('The network rejected this post');
    });

    it('claims each job once, even when two workers run at the same time', async () => {
      const c = await makeChannel();
      const p = piece();
      await queue({ contentId: p.id, channelIds: [c.id], when: 'now' }).expect(201);
      const [a, b] = await Promise.all([publishing.processDue(), publishing.processDue()]);
      expect(a.published + b.published).toBe(1);
      expect(sent).toHaveLength(1);
    });

    it('does not publish content that lost its approval, and fails interrupted jobs instead of re-sending', async () => {
      const c = await makeChannel();
      const p = piece();
      await queue({ contentId: p.id, channelIds: [c.id], when: 'now' }).expect(201);
      p.approvalStatus = 'DRAFT'; // e.g. edited after queueing
      await publishing.processDue();
      expect(jobs[0].status).toBe('CANCELLED');
      expect(sent).toHaveLength(0);

      const q = piece();
      await queue({ contentId: q.id, channelIds: [c.id], when: 'now' }).expect(201);
      const job = jobs.find((j) => j.contentId === q.id);
      job.status = 'PUBLISHING';
      job.updatedAt = new Date(Date.now() - 30 * 60_000);
      await publishing.processDue();
      expect(job.status).toBe('FAILED');
      expect(job.lastError).toMatch(/Interrupted/);
      expect(sent).toHaveLength(0);
    });

    it('cancels a waiting post, but not one that is already going out', async () => {
      const c = await makeChannel();
      const p = piece();
      const res = await queue({ contentId: p.id, channelIds: [c.id], when: 'now' }).expect(201);
      const id = res.body.jobs[0].id;
      const cancelled = await jobAction(id, 'cancel').expect(201);
      expect(cancelled.body.status).toBe('CANCELLED');
      await jobAction(id, 'cancel').expect(409);
      await jobAction(id, 'retry', U_EDITOR).expect(403);
      await jobAction(id, 'retry', U_OTHER).expect(404);
      await jobAction(id, 'retry').expect(201);
      jobs[0].status = 'PUBLISHING';
      await jobAction(id, 'cancel').expect(409);
    });
  });

  describe('WordPress channels', () => {
    const site = 'https://site.example';
    const login = { username: 'editor', applicationPassword: 'abcd efgh ijkl mnop' };
    const okMe = {
      status: 200,
      json: { id: 3, name: 'Jane', capabilities: { publish_posts: true } },
    };
    const wpBody = { provider: 'WORDPRESS', name: 'My website', siteUrl: site + '/', ...login };
    const create = (body: object = wpBody, user = U_ADMIN) =>
      request(app.getHttpServer())
        .post(`${base}/channels`)
        .set('Authorization', as(user))
        .send(body);
    const article = (over: Record<string, unknown> = {}) =>
      piece({
        kind: 'ARTICLE',
        title: 'Open Day at Atlas',
        language: 'en',
        content: {
          seoTitle: 'Open Day at Atlas University',
          metaDescription: 'Join us on 14 March.',
          slug: 'open-day-atlas',
          h1: 'Open Day at Atlas University',
          excerpt: 'Meet teachers on 14 March.',
          introduction: 'Atlas University holds its Open Day on 14 March.',
          sections: [{ heading: 'What to expect', body: 'Tours and talks.' }],
          conclusion: 'See you there.',
          faq: [],
          imageAltText: 'Campus',
        },
        ...over,
      });

    beforeEach(() => {
      wpHttp = async () => okMe;
    });

    it('verifies the login, stores it encrypted, and never returns it', async () => {
      const res = await create().expect(201);
      expect(res.body.config).toMatchObject({
        siteUrl: site,
        publishAs: 'publish',
        wordpressUser: 'Jane',
      });
      expect(res.body).not.toHaveProperty('credentials');
      expect(JSON.stringify(res.body)).not.toContain('abcd efgh');
      const stored = channels[0].credentials as string;
      expect(stored).toMatch(/^v1:/);
      expect(stored).not.toContain('abcd efgh');
      expect(stored).not.toContain('editor');

      const list = await request(app.getHttpServer())
        .get(`${base}/channels`)
        .set('Authorization', as(U_VIEWER))
        .expect(200);
      expect(JSON.stringify(list.body)).not.toContain('credentials');
      const renamed = await request(app.getHttpServer())
        .patch(`${base}/channels/${res.body.id}`)
        .set('Authorization', as(U_ADMIN))
        .send({ name: 'Renamed site' })
        .expect(200);
      expect(renamed.body).not.toHaveProperty('credentials');
      const prov = await request(app.getHttpServer())
        .get(`${base}/channels/providers`)
        .set('Authorization', as(U_VIEWER))
        .expect(200);
      expect(prov.body.find((p: any) => p.provider === 'WORDPRESS').available).toBe(true);
    });

    it('saves nothing when the login is wrong or the site is not WordPress', async () => {
      wpHttp = async () => ({ status: 401, json: { code: 'incorrect_password' } });
      const bad = await create().expect(422);
      expect(String(bad.body.message)).toMatch(/did not accept/);
      wpHttp = async () => ({ status: 404, json: null });
      await create().expect(422);
      await create({ ...wpBody, siteUrl: 'http://insecure.example' }).expect(422);
      await create({ ...wpBody, applicationPassword: 'short' }).expect(400);
      await create({ provider: 'WORDPRESS', name: 'No details' }).expect(400);
      expect(channels).toHaveLength(0);
      await create(wpBody, U_EDITOR).expect(403);
    });

    it('is unavailable, with a clear reason, when the server has no encryption key', async () => {
      const key = process.env.ENCRYPTION_KEY;
      delete process.env.ENCRYPTION_KEY;
      try {
        const res = await create().expect(422);
        expect(String(res.body.message)).toMatch(/ENCRYPTION_KEY/);
        const prov = await request(app.getHttpServer())
          .get(`${base}/channels/providers`)
          .set('Authorization', as(U_VIEWER))
          .expect(200);
        expect(prov.body.find((p: any) => p.provider === 'WORDPRESS').available).toBe(false);
        expect(prov.body.find((p: any) => p.provider === 'TEST').available).toBe(true);
        expect(channels).toHaveLength(0);
      } finally {
        process.env.ENCRYPTION_KEY = key;
      }
    });

    it('publishes an approved article with the decrypted login, and only articles', async () => {
      const ch = (await create().expect(201)).body;
      const calls: any[] = [];
      wpHttp = async (url, opts) => {
        calls.push({ url, opts });
        if (opts?.method === 'POST')
          return { status: 201, json: { id: 77, link: site + '/open-day-atlas/' } };
        return { status: 200, json: [] };
      };
      const art = article();
      await queue({ contentId: art.id, channelIds: [ch.id], when: 'now' }).expect(201);
      await publishing.processDue();

      const job = jobs[0];
      expect(job.status).toBe('PUBLISHED');
      expect(job.externalId).toBe('77');
      expect(job.externalUrl).toBe(site + '/open-day-atlas/');
      expect(job.payload.html).toContain('<h2>What to expect</h2>');
      const post = calls.find((c) => c.opts?.method === 'POST');
      expect(post.url).toBe(site + '/wp-json/wp/v2/posts');
      expect(post.opts.headers.Authorization).toBe(
        'Basic ' + Buffer.from('editor:abcd efgh ijkl mnop').toString('base64'),
      );
      expect(post.opts.body).toMatchObject({
        title: 'Open Day at Atlas University',
        slug: 'open-day-atlas',
        status: 'publish',
      });

      const social = piece(); // a Facebook post
      const res = await queue({ contentId: social.id, channelIds: [ch.id], when: 'now' }).expect(
        422,
      );
      expect(String(res.body.message)).toMatch(/cannot publish this type/);
    });

    it('uploads the article picture as the featured image, read back from storage, with its description', async () => {
      const ch = (await create().expect(201)).body;
      const calls: any[] = [];
      wpHttp = async (url, opts) => {
        calls.push({ url: String(url), opts });
        if (String(url).endsWith('/wp/v2/media')) return { status: 201, json: { id: 88 } };
        if (String(url).includes('/wp/v2/media/')) return { status: 200, json: { id: 88 } };
        if (opts?.method === 'POST')
          return { status: 201, json: { id: 77, link: site + '/open-day-atlas/' } };
        return { status: 200, json: [] };
      };
      const art = article();
      stored.set('wpkey', Buffer.from('picture-bytes'));
      images.push({
        contentId: art.id,
        position: 0,
        altText: 'Atlas campus courtyard',
        asset: { filename: 'courtyard.png', mimeType: 'image/png', storageKey: 'wpkey' },
      });
      await queue({ contentId: art.id, channelIds: [ch.id], when: 'now' }).expect(201);
      await publishing.processDue();

      expect(jobs[0].status).toBe('PUBLISHED');
      expect(jobs[0].payload.imageCount).toBe(1);
      const upload = calls.find((c) => c.url.endsWith('/wp/v2/media'));
      expect(upload.opts.raw.data.toString()).toBe('picture-bytes');
      expect(upload.opts.headers.Authorization).toBe(
        'Basic ' + Buffer.from('editor:abcd efgh ijkl mnop').toString('base64'),
      );
      expect(calls.find((c) => c.url.endsWith('/media/88')).opts.body).toEqual({
        alt_text: 'Atlas campus courtyard',
      });
      const post = calls.find((c) => c.url.endsWith('/wp/v2/posts') && c.opts?.method === 'POST');
      expect(post.opts.body.featured_media).toBe(88);
    });

    it('stops using a channel whose login was revoked, and keeps nothing waiting on it', async () => {
      const ch = (await create().expect(201)).body;
      wpHttp = async (_u, opts) =>
        opts?.method === 'POST'
          ? { status: 401, json: { code: 'rest_cannot_create' } }
          : { status: 200, json: [] };
      const first = article();
      const second = article({ title: 'Another article' });
      await queue({ contentId: first.id, channelIds: [ch.id], when: 'now' }).expect(201);
      await queue({ contentId: second.id, channelIds: [ch.id], when: 'scheduled' }).expect(409); // not scheduled: nothing queued
      second.scheduledFor = new Date(Date.now() + 3_600_000);
      await queue({ contentId: second.id, channelIds: [ch.id], when: 'scheduled' }).expect(201);

      await publishing.processDue();
      expect(jobs.find((j) => j.contentId === first.id).status).toBe('FAILED');
      expect(jobs.find((j) => j.contentId === first.id).lastError).toMatch(/Reconnect/);
      expect(jobs.find((j) => j.contentId === second.id).status).toBe('CANCELLED');
      expect(channels[0].status).toBe('ERROR');
      expect(channels[0].lastError).toMatch(/rejected the saved login/);
      await queue({ contentId: first.id, channelIds: [ch.id], when: 'now' }).expect(409); // needs reconnecting
    });

    it('retries a WordPress outage and then succeeds without posting twice', async () => {
      const ch = (await create().expect(201)).body;
      let posts = 0;
      wpHttp = async (_u, opts) => {
        if (opts?.method !== 'POST') return { status: 200, json: [] };
        posts++;
        return posts === 1
          ? { status: 503, json: null }
          : { status: 201, json: { id: 5, link: site + '/p/' } };
      };
      const art = article();
      await queue({ contentId: art.id, channelIds: [ch.id], when: 'now' }).expect(201);
      const t0 = new Date();
      await publishing.processDue(t0);
      expect(jobs[0].status).toBe('QUEUED');
      expect(jobs[0].lastError).toMatch(/not available right now/);
      await publishing.processDue(new Date(t0.getTime() + 6 * 60_000));
      expect(jobs[0].status).toBe('PUBLISHED');
      expect(posts).toBe(2);
    });
  });

  describe('Facebook channels', () => {
    const TOKEN = 'EAAB' + 'x'.repeat(40);
    const fbBody = {
      provider: 'FACEBOOK',
      name: 'Atlas page',
      pageId: '1234567890',
      accessToken: TOKEN,
    };
    const okMe = { status: 200, json: { id: '1234567890', name: 'Atlas University' } };
    const create = (body: object = fbBody, user = U_ADMIN) =>
      request(app.getHttpServer())
        .post(`${base}/channels`)
        .set('Authorization', as(user))
        .send(body);
    const addImage = (contentId: string, name: string, position: number) => {
      const storageKey = `${ORG_A}/${name}`;
      stored.set(storageKey, Buffer.from('bytes-of-' + name));
      images.push({
        contentId,
        position,
        asset: { filename: name, mimeType: 'image/png', storageKey },
      });
    };

    beforeEach(() => {
      wpHttp = async () => okMe;
    });

    it('verifies the token against the Page, stores it encrypted, and never returns it', async () => {
      const res = await create().expect(201);
      expect(res.body.config).toEqual({ pageId: '1234567890', pageName: 'Atlas University' });
      expect(JSON.stringify(res.body)).not.toContain(TOKEN);
      expect(res.body).not.toHaveProperty('credentials');
      expect(channels[0].credentials).toMatch(/^v1:/);
      expect(channels[0].credentials).not.toContain('EAAB');

      wpHttp = async () => ({ status: 200, json: { id: '999', name: 'Someone else' } });
      const bad = await create({ ...fbBody, name: 'Wrong page' }).expect(422);
      expect(String(bad.body.message)).toMatch(/does not belong to that Page/);
      await create({ ...fbBody, pageId: 'abc' }).expect(400);
      expect(channels).toHaveLength(1);
      await create(fbBody, U_EDITOR).expect(403);
    });

    it('publishes a Facebook post with its pictures, and refuses other kinds of content', async () => {
      const ch = (await create().expect(201)).body;
      const calls: any[] = [];
      let n = 0;
      wpHttp = async (url, opts) => {
        calls.push({ url, opts });
        if (String(url).endsWith('/photos')) return { status: 200, json: { id: `photo-${++n}` } };
        return { status: 200, json: { id: '1234567890_42' } };
      };
      const post = piece({
        content: {
          postText: 'Open Day on 14 March at the Rabat campus.',
          cta: 'Register',
          hashtags: ['OpenDay'],
          link: null,
        },
      });
      addImage(post.id, 'one.png', 0);
      addImage(post.id, 'two.png', 1);
      await queue({ contentId: post.id, channelIds: [ch.id], when: 'now' }).expect(201);
      await publishing.processDue();

      expect(jobs[0].status).toBe('PUBLISHED');
      expect(jobs[0].externalId).toBe('1234567890_42');
      expect(jobs[0].externalUrl).toBe('https://www.facebook.com/1234567890_42');
      expect(jobs[0].payload.imageCount).toBe(2);
      const uploads = calls.filter((c) => String(c.url).endsWith('/photos'));
      expect(uploads).toHaveLength(2);
      expect(uploads[0].opts.raw.data.toString('latin1')).toContain('bytes-of-one.png'); // read back from storage
      expect(uploads[1].opts.raw.data.toString('latin1')).toContain('bytes-of-two.png');
      const feed = calls.find((c) => String(c.url).endsWith('/feed'));
      expect(feed.opts.body.attached_media).toEqual([
        { media_fbid: 'photo-1' },
        { media_fbid: 'photo-2' },
      ]);
      expect(feed.opts.headers.Authorization).toBe(`Bearer ${TOKEN}`); // the decrypted token

      const article = piece({
        kind: 'ARTICLE',
        content: { slug: 's', h1: 'T', introduction: 'x', sections: [], conclusion: '' },
      });
      const res = await queue({ contentId: article.id, channelIds: [ch.id], when: 'now' }).expect(
        422,
      );
      expect(String(res.body.message)).toMatch(/cannot publish this type/);
    });

    it('publishes a text post without pictures and flags the channel when Facebook revokes the token', async () => {
      const ch = (await create().expect(201)).body;
      wpHttp = async () => ({
        status: 400,
        json: { error: { code: 190, message: 'Session has expired' } },
      });
      const first = piece();
      const second = piece({ scheduledFor: new Date(Date.now() + 3_600_000) });
      await queue({ contentId: first.id, channelIds: [ch.id], when: 'now' }).expect(201);
      await queue({ contentId: second.id, channelIds: [ch.id], when: 'scheduled' }).expect(201);
      await publishing.processDue();
      expect(jobs.find((j) => j.contentId === first.id).status).toBe('FAILED');
      expect(jobs.find((j) => j.contentId === second.id).status).toBe('CANCELLED');
      expect(channels[0].status).toBe('ERROR');
      expect(channels[0].lastError).toMatch(/Reconnect/);
      await queue({ contentId: first.id, channelIds: [ch.id], when: 'now' }).expect(409);
    });
  });

  describe('LinkedIn channels', () => {
    const TOKEN = 'AQV' + 'x'.repeat(60);
    const create = (
      body: object = { provider: 'LINKEDIN', name: 'My LinkedIn', accessToken: TOKEN },
      user = U_ADMIN,
    ) =>
      request(app.getHttpServer())
        .post(`${base}/channels`)
        .set('Authorization', as(user))
        .send(body);
    const me = { status: 200, json: { sub: 'abc123', name: 'Said M' } };
    const liPost = () =>
      piece({
        kind: 'LINKEDIN',
        content: {
          postText: 'Open Day on 14 March (free).',
          cta: 'Register',
          hashtags: ['OpenDay'],
          imageMode: 'text',
          images: [],
        },
      });

    beforeEach(() => {
      wpHttp = async () => me;
    });

    it('verifies the token, stores it encrypted, and never returns it', async () => {
      const res = await create().expect(201);
      expect(res.body.config).toEqual({ authorUrn: 'urn:li:person:abc123', memberName: 'Said M' });
      expect(JSON.stringify(res.body)).not.toContain(TOKEN);
      expect(channels[0].credentials).toMatch(/^v1:/);
      expect(channels[0].credentials).not.toContain('AQV');

      wpHttp = async () => ({ status: 401, json: null });
      const bad = await create({
        provider: 'LINKEDIN',
        name: 'Bad token',
        accessToken: TOKEN,
      }).expect(422);
      expect(String(bad.body.message)).toMatch(/did not accept/);
      await create({ provider: 'LINKEDIN', name: 'No token' }).expect(400);
      expect(channels).toHaveLength(1);
    });

    it('publishes a LinkedIn post with pictures, escaped text and the decrypted token, and only that kind', async () => {
      const ch = (await create().expect(201)).body;
      const calls: any[] = [];
      let n = 0;
      wpHttp = async (url, opts) => {
        calls.push({ url, opts });
        if (String(url).includes('initializeUpload')) {
          n++;
          return {
            status: 200,
            json: {
              value: { uploadUrl: `https://uploads.example/${n}`, image: `urn:li:image:${n}` },
            },
          };
        }
        if (opts?.method === 'PUT') return { status: 201, json: null };
        return { status: 201, json: null, headers: { 'x-restli-id': 'urn:li:share:9' } };
      };
      const post = liPost();
      stored.set('k1', Buffer.from('one'));
      stored.set('k2', Buffer.from('two'));
      images.push({
        contentId: post.id,
        position: 0,
        asset: { filename: 'one.png', mimeType: 'image/png', storageKey: 'k1' },
      });
      images.push({
        contentId: post.id,
        position: 1,
        asset: { filename: 'two.png', mimeType: 'image/png', storageKey: 'k2' },
      });
      await queue({ contentId: post.id, channelIds: [ch.id], when: 'now' }).expect(201);
      await publishing.processDue();

      expect(jobs[0].status).toBe('PUBLISHED');
      expect(jobs[0].externalId).toBe('urn:li:share:9');
      expect(jobs[0].payload.imageCount).toBe(2);
      const posted = calls[calls.length - 1];
      expect(posted.url).toBe('https://api.linkedin.com/rest/posts');
      expect(posted.opts.headers.Authorization).toBe(`Bearer ${TOKEN}`);
      expect(posted.opts.body.commentary).toBe(
        'Open Day on 14 March \\(free\\).\n\nRegister\n\n{hashtag|\\#|OpenDay}',
      );
      expect(posted.opts.body.content.multiImage.images).toHaveLength(2);

      const fb = piece(); // a Facebook post
      const res = await queue({ contentId: fb.id, channelIds: [ch.id], when: 'now' }).expect(422);
      expect(String(res.body.message)).toMatch(/cannot publish this type/);
    });

    it('flags the channel when the 60-day token expires and cancels what was waiting', async () => {
      const ch = (await create().expect(201)).body;
      wpHttp = async () => ({ status: 401, json: { message: 'The token has expired' } });
      const first = liPost();
      const second = liPost();
      second.scheduledFor = new Date(Date.now() + 3_600_000);
      await queue({ contentId: first.id, channelIds: [ch.id], when: 'now' }).expect(201);
      await queue({ contentId: second.id, channelIds: [ch.id], when: 'scheduled' }).expect(201);
      await publishing.processDue();
      expect(jobs.find((j) => j.contentId === first.id).status).toBe('FAILED');
      expect(jobs.find((j) => j.contentId === second.id).status).toBe('CANCELLED');
      expect(channels[0].status).toBe('ERROR');
      expect(channels[0].lastError).toMatch(/60 days/);
      await queue({ contentId: first.id, channelIds: [ch.id], when: 'now' }).expect(409);
    });
  });

  describe('automatic publishing', () => {
    const schedule = (id: string, when: Date, user = U_PUBLISHER) =>
      request(app.getHttpServer())
        .post(`${base}/content/${id}/schedule`)
        .set('Authorization', as(user))
        .send({ scheduledFor: when.toISOString() });
    const auto = async (name: string, on = true) => {
      const ch = await makeChannel(name);
      await request(app.getHttpServer())
        .patch(`${base}/channels/${ch.id}`)
        .set('Authorization', as(U_ADMIN))
        .send({ autoPublish: on })
        .expect(200);
      return ch;
    };
    const inHours = (h: number) => new Date(Date.now() + h * 3_600_000);

    it('is switched on and off by admins, and is off by default', async () => {
      const ch = await makeChannel('Plain channel');
      expect(ch.autoPublish).toBe(false);
      const on = await request(app.getHttpServer())
        .patch(`${base}/channels/${ch.id}`)
        .set('Authorization', as(U_ADMIN))
        .send({ autoPublish: true })
        .expect(200);
      expect(on.body.autoPublish).toBe(true);
      await request(app.getHttpServer())
        .patch(`${base}/channels/${ch.id}`)
        .set('Authorization', as(U_EDITOR))
        .send({ autoPublish: false })
        .expect(403);
      await request(app.getHttpServer())
        .patch(`${base}/channels/${ch.id}`)
        .set('Authorization', as(U_ADMIN))
        .send({ autoPublish: 'yes' })
        .expect(400);
      const created = await request(app.getHttpServer())
        .post(`${base}/channels`)
        .set('Authorization', as(U_ADMIN))
        .send({ provider: 'TEST', name: 'Born automatic', autoPublish: true })
        .expect(201);
      expect(created.body.autoPublish).toBe(true);
    });

    it('queues scheduled content only to channels with automatic publishing, and posts it at that time', async () => {
      const on = await auto('Automatic channel');
      await makeChannel('Manual channel'); // off
      const p = piece();
      const at = inHours(2);
      const res = await schedule(p.id, at).expect(201);
      expect(res.body.auto).toEqual({ queued: ['Automatic channel'], skipped: [] });

      expect(jobs).toHaveLength(1);
      expect(jobs[0].channelId).toBe(on.id);
      expect(jobs[0].followsSchedule).toBe(true);
      expect(new Date(jobs[0].runAt).getTime()).toBe(at.getTime());

      expect((await publishing.processDue(new Date())).due).toBe(0); // not yet
      expect((await publishing.processDue(new Date(at.getTime() + 1000))).published).toBe(1);
      expect(jobs[0].status).toBe('PUBLISHED');
      expect(sent).toHaveLength(1);
    });

    it('moves the post when the date changes, never duplicates it, and cancels it when the schedule is removed', async () => {
      await auto('Automatic channel');
      const p = piece();
      await schedule(p.id, inHours(2)).expect(201);
      const later = inHours(5);
      const again = await schedule(p.id, later).expect(201);
      expect(again.body.auto.queued).toEqual([]); // already waiting: nothing new
      expect(jobs).toHaveLength(1);
      expect(new Date(jobs[0].runAt).getTime()).toBe(later.getTime());

      await request(app.getHttpServer())
        .post(`${base}/content/${p.id}/unschedule`)
        .set('Authorization', as(U_PUBLISHER))
        .expect(201);
      expect(jobs[0].status).toBe('CANCELLED');

      // Scheduling again brings it back.
      const back = await schedule(p.id, inHours(6)).expect(201);
      expect(back.body.auto.queued).toEqual(['Automatic channel']);
      expect(jobs).toHaveLength(1);
      expect(jobs[0].status).toBe('QUEUED');
    });

    it('skips a channel that cannot take the content and says why, without blocking the others', async () => {
      await auto('Good channel');
      const strict = await auto('Strict channel');
      // A LinkedIn post over the network limit is refused for every channel: report it once per channel.
      const tooLong = piece({
        kind: 'LINKEDIN',
        content: { postText: 'z'.repeat(3100), cta: '', hashtags: [] },
      });
      const res = await schedule(tooLong.id, inHours(2)).expect(201);
      expect(res.body.auto.queued).toEqual([]);
      expect(res.body.auto.skipped).toHaveLength(2);
      expect(res.body.auto.skipped[0].reason).toMatch(/3000/);
      expect(jobs).toHaveLength(0);
      expect(strict.id).toBeTruthy();
    });

    it('stays quiet about channels that never publish this kind of content', async () => {
      // The test publisher takes everything, so pause it and use a real-kind restriction instead:
      // an automatic WordPress channel only takes articles, so a Facebook post is simply not for it.
      wpHttp = async () => ({
        status: 200,
        json: { id: 3, name: 'Jane', capabilities: { publish_posts: true } },
      });
      const wp = (
        await request(app.getHttpServer())
          .post(`${base}/channels`)
          .set('Authorization', as(U_ADMIN))
          .send({
            provider: 'WORDPRESS',
            name: 'My site',
            siteUrl: 'https://site.example',
            username: 'editor',
            applicationPassword: 'abcd efgh ijkl mnop',
            autoPublish: true,
          })
          .expect(201)
      ).body;
      const fbPost = piece();
      const res = await schedule(fbPost.id, inHours(2)).expect(201);
      expect(res.body.auto).toEqual({ queued: [], skipped: [] });
      expect(jobs).toHaveLength(0);
      expect(wp.autoPublish).toBe(true);
    });

    it('ignores paused channels, and scheduling still works with none configured', async () => {
      const ch = await auto('Paused channel');
      await request(app.getHttpServer())
        .patch(`${base}/channels/${ch.id}`)
        .set('Authorization', as(U_ADMIN))
        .send({ status: 'DISCONNECTED' })
        .expect(200);
      const p = piece();
      const res = await schedule(p.id, inHours(2)).expect(201);
      expect(res.body.auto).toEqual({ queued: [], skipped: [] });
      expect(res.body.scheduledFor).toBeTruthy();

      channels = [];
      const q = piece();
      await schedule(q.id, inHours(3)).expect(201);
      expect(jobs).toHaveLength(0);
    });

    it('does not queue anything for content that is not approved, or from people who cannot schedule', async () => {
      await auto('Automatic channel');
      const draft = piece({ approvalStatus: 'DRAFT' });
      await schedule(draft.id, inHours(2)).expect(409);
      const p = piece();
      await schedule(p.id, inHours(2), U_EDITOR).expect(403);
      expect(jobs).toHaveLength(0);
    });
  });

  describe('reconnecting a channel', () => {
    const OLD = 'AQV' + 'o'.repeat(60);
    const NEW = 'AQV' + 'n'.repeat(60);
    const profile = (sub = 'abc123') => ({ status: 200, json: { sub, name: 'Said M' } });
    const connect = async (provider: string, body: object) =>
      (
        await request(app.getHttpServer())
          .post(`${base}/channels`)
          .set('Authorization', as(U_ADMIN))
          .send({ provider, name: 'My channel', ...body })
          .expect(201)
      ).body;
    const reconnect = (id: string, body: object, user = U_ADMIN) =>
      request(app.getHttpServer())
        .post(`${base}/channels/${id}/reconnect`)
        .set('Authorization', as(user))
        .send(body);
    const liPost = () =>
      piece({
        kind: 'LINKEDIN',
        content: {
          postText: 'Open Day on 14 March.',
          cta: '',
          hashtags: [],
          imageMode: 'text',
          images: [],
        },
      });

    it('replaces an expired login, brings the channel back, and the next retry uses the new login', async () => {
      wpHttp = async () => profile();
      const ch = await connect('LINKEDIN', { accessToken: OLD });
      const storedBefore = channels[0].credentials;

      // The 60-day token expires: the channel is flagged and its post fails.
      wpHttp = async () => ({ status: 401, json: { message: 'The token has expired' } });
      const post = liPost();
      await queue({ contentId: post.id, channelIds: [ch.id], when: 'now' }).expect(201);
      await publishing.processDue();
      expect(channels[0].status).toBe('ERROR');
      expect(jobs[0].status).toBe('FAILED');

      // Reconnect with a new token for the same profile.
      wpHttp = async () => profile();
      const res = await reconnect(ch.id, { accessToken: NEW }).expect(201);
      expect(res.body.status).toBe('CONNECTED');
      expect(res.body.lastError).toBeNull();
      expect(res.body.config.authorUrn).toBe('urn:li:person:abc123');
      expect(JSON.stringify(res.body)).not.toContain(NEW);
      expect(res.body).not.toHaveProperty('credentials');
      expect(channels[0].credentials).not.toBe(storedBefore);
      expect(channels[0].credentials).not.toContain('nnnn');
      expect(channels).toHaveLength(1); // same channel, history kept
      expect(jobs).toHaveLength(1);

      // Trying the failed post again uses the new token.
      const seen: any[] = [];
      wpHttp = async (url, opts) => {
        seen.push(opts?.headers?.Authorization);
        return { status: 201, json: null, headers: { 'x-restli-id': 'urn:li:share:77' } };
      };
      await request(app.getHttpServer())
        .post(`${base}/publishing/jobs/${jobs[0].id}/retry`)
        .set('Authorization', as(U_PUBLISHER))
        .expect(201);
      await publishing.processDue(new Date(Date.now() + 1000));
      expect(jobs[0].status).toBe('PUBLISHED');
      expect(seen).toEqual([`Bearer ${NEW}`]);
    });

    it('changes nothing when the new login is wrong, expired, or for a different account', async () => {
      wpHttp = async () => profile();
      const ch = await connect('LINKEDIN', { accessToken: OLD });
      channels[0].status = 'ERROR';
      channels[0].lastError = 'expired';
      const snapshot = { ...channels[0] };

      wpHttp = async () => ({ status: 401, json: null });
      const bad = await reconnect(ch.id, { accessToken: NEW }).expect(422);
      expect(String(bad.body.message)).toMatch(/did not accept/);

      wpHttp = async () => profile('someone-else');
      const other = await reconnect(ch.id, { accessToken: NEW }).expect(422);
      expect(String(other.body.message)).toMatch(/different account/);

      await reconnect(ch.id, {}).expect(400);
      expect(channels[0]).toEqual(snapshot); // nothing was touched
    });

    it('keeps a Facebook channel on its own Page', async () => {
      const TOKEN = 'EAAB' + 'x'.repeat(40);
      wpHttp = async () => ({ status: 200, json: { id: '1234567890', name: 'Atlas' } });
      const ch = await connect('FACEBOOK', { pageId: '1234567890', accessToken: TOKEN });
      channels[0].status = 'ERROR';

      wpHttp = async () => ({ status: 200, json: { id: '999', name: 'Another page' } });
      const wrong = await reconnect(ch.id, { accessToken: 'EAAB' + 'y'.repeat(40) }).expect(422);
      expect(String(wrong.body.message)).toMatch(/does not belong to that Page/);
      expect(channels[0].status).toBe('ERROR');

      wpHttp = async () => ({ status: 200, json: { id: '1234567890', name: 'Atlas' } });
      const ok = await reconnect(ch.id, { accessToken: 'EAAB' + 'y'.repeat(40) }).expect(201);
      expect(ok.body.status).toBe('CONNECTED');
      expect(ok.body.config.pageId).toBe('1234567890');
    });

    it('keeps a WordPress channel on its own site and keeps its settings', async () => {
      const seen: string[] = [];
      wpHttp = async (url) => {
        seen.push(String(url));
        return {
          status: 200,
          json: { id: 3, name: 'Jane', capabilities: { publish_posts: true, edit_posts: true } },
        };
      };
      const ch = await connect('WORDPRESS', {
        siteUrl: 'https://site.example',
        username: 'editor',
        applicationPassword: 'abcd efgh ijkl mnop',
        publishAs: 'draft',
      });
      channels[0].status = 'ERROR';
      seen.length = 0;

      // A different site address in the request is ignored: the channel's own site is used.
      const res = await reconnect(ch.id, {
        siteUrl: 'https://evil.example',
        username: 'editor',
        applicationPassword: 'new new new new pass',
      }).expect(201);
      expect(seen[0]).toBe('https://site.example/wp-json/wp/v2/users/me?context=edit');
      expect(res.body.config).toMatchObject({
        siteUrl: 'https://site.example',
        publishAs: 'draft',
      });
      expect(res.body.status).toBe('CONNECTED');
    });

    it('has nothing to reconnect on the test channel, and is for admins in their own organization', async () => {
      const test = await makeChannel('Plain test');
      const res = await reconnect(test.id, {}).expect(422);
      expect(String(res.body.message)).toMatch(/no login/);

      wpHttp = async () => profile();
      const ch = await connect('LINKEDIN', { accessToken: OLD });
      await reconnect(ch.id, { accessToken: NEW }, U_EDITOR).expect(403);
      await reconnect(ch.id, { accessToken: NEW }, U_PUBLISHER).expect(403);
      await reconnect(ch.id, { accessToken: NEW }, U_OTHER).expect(404);
      await reconnect('not-a-uuid', { accessToken: NEW }).expect(404);
      await reconnect(randomUUID(), { accessToken: NEW }).expect(404);
    });

    it('says so when the server cannot store logins', async () => {
      wpHttp = async () => profile();
      const ch = await connect('LINKEDIN', { accessToken: OLD });
      const key = process.env.ENCRYPTION_KEY;
      delete process.env.ENCRYPTION_KEY;
      try {
        const res = await reconnect(ch.id, { accessToken: NEW }).expect(422);
        expect(String(res.body.message)).toMatch(/ENCRYPTION_KEY/);
      } finally {
        process.env.ENCRYPTION_KEY = key;
      }
    });
  });

  it('lists jobs for a piece of content', async () => {
    const c = await makeChannel();
    const p = piece();
    const p2 = piece();
    await queue({ contentId: p.id, channelIds: [c.id], when: 'now' }).expect(201);
    await queue({ contentId: p2.id, channelIds: [c.id], when: 'now' }).expect(201);
    const res = await request(app.getHttpServer())
      .get(`${base}/publishing/jobs?contentId=${p.id}`)
      .set('Authorization', as(U_VIEWER))
      .expect(200);
    expect(res.body).toHaveLength(1);
    await request(app.getHttpServer())
      .get(`${base}/publishing/jobs?status=NOPE`)
      .set('Authorization', as(U_VIEWER))
      .expect(400);
  });
});
