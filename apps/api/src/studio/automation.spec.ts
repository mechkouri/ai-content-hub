import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { AppModule } from '../app.module';
import { TOKEN_VERIFIER } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { isTimeZone, nextSlot } from './automation-timing';
import { AutomationService, MAX_RULES_PER_ORG } from './automation.service';

const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';
const U_ADMIN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const U_EDITOR = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const U_OTHER = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

describe('daily time slots', () => {
  const iso = (d: Date) => d.toISOString();

  it('knows real time zones and rejects invented ones', () => {
    expect(isTimeZone('Africa/Casablanca')).toBe(true);
    expect(isTimeZone('Europe/Paris')).toBe(true);
    expect(isTimeZone('UTC')).toBe(true);
    expect(isTimeZone('Mars/Olympus')).toBe(false);
    expect(isTimeZone('')).toBe(false);
  });

  it('picks today when the time is far enough ahead, otherwise tomorrow', () => {
    // 07:00 UTC on a winter day. Paris is UTC+1: 09:00 Paris is 08:00 UTC, an hour away.
    const now = new Date('2027-01-15T07:00:00Z');
    expect(iso(nextSlot(now, '09:00', 'Europe/Paris', 15))).toBe('2027-01-15T08:00:00.000Z');
    // 08:50 Paris is 07:50 UTC: only 50 minutes away, fine; but 08:05 Paris (07:05 UTC) is too close.
    expect(iso(nextSlot(now, '08:05', 'Europe/Paris', 15))).toBe('2027-01-16T07:05:00.000Z');
    // already passed today
    expect(iso(nextSlot(now, '06:00', 'UTC', 15))).toBe('2027-01-16T06:00:00.000Z');
  });

  it('respects the lead time exactly', () => {
    const now = new Date('2027-03-10T12:00:00Z');
    expect(iso(nextSlot(now, '12:15', 'UTC', 15))).toBe('2027-03-10T12:15:00.000Z'); // exactly 15 minutes
    expect(iso(nextSlot(now, '12:14', 'UTC', 15))).toBe('2027-03-11T12:14:00.000Z'); // one minute short
  });

  it('follows the time zone across the date line', () => {
    // 23:30 UTC is already the next day in Tokyo (UTC+9): 09:00 Tokyo on the 16th is 00:00 UTC on the 16th.
    const now = new Date('2027-01-15T23:30:00Z');
    expect(iso(nextSlot(now, '09:00', 'Asia/Tokyo', 15))).toBe('2027-01-16T00:00:00.000Z');
    // And in Los Angeles (UTC-8) it is still the afternoon of the 15th.
    expect(iso(nextSlot(now, '09:00', 'America/Los_Angeles', 15))).toBe('2027-01-16T17:00:00.000Z');
  });

  it('handles daylight saving time: the slot keeps its local time', () => {
    // Paris switches to summer time on 2027-03-28 (02:00 -> 03:00). 09:00 Paris is UTC+1 before, UTC+2 after.
    expect(iso(nextSlot(new Date('2027-03-27T10:00:00Z'), '09:00', 'Europe/Paris', 15))).toBe(
      '2027-03-28T07:00:00.000Z',
    ); // already summer time on the 28th: 09:00 local is 07:00 UTC
    expect(iso(nextSlot(new Date('2027-03-26T10:00:00Z'), '09:00', 'Europe/Paris', 15))).toBe(
      '2027-03-27T08:00:00.000Z',
    ); // still winter time on the 27th
    // New York ends summer time on 2027-11-07.
    expect(iso(nextSlot(new Date('2027-11-06T20:00:00Z'), '09:00', 'America/New_York', 15))).toBe(
      '2027-11-07T14:00:00.000Z',
    );
  });

  it('works across a month and year end', () => {
    expect(iso(nextSlot(new Date('2027-12-31T23:00:00Z'), '09:00', 'UTC', 15))).toBe(
      '2028-01-01T09:00:00.000Z',
    );
    expect(iso(nextSlot(new Date('2027-02-28T23:50:00Z'), '00:10', 'UTC', 15))).toBe(
      '2027-03-01T00:10:00.000Z',
    );
  });

  it('rejects a time that is not HH:MM', () => {
    for (const bad of ['9:00', '24:00', '12:60', 'noon', '']) {
      expect(() => nextSlot(new Date(), bad, 'UTC')).toThrow('Invalid time');
    }
  });
});

describe('what happens when content is approved', () => {
  const CONTENT = randomUUID();
  const CH1 = randomUUID();
  const CH2 = randomUUID();
  let rules: any[];
  let channels: any[];
  let piece: any;
  const schedule = { schedule: jest.fn() };
  const publishing = { queue: jest.fn() };
  const prisma: any = {
    contentPiece: { findFirst: jest.fn(async () => piece) },
    channel: {
      findMany: jest.fn(async ({ where }: any) =>
        channels.filter(
          (c) =>
            c.organizationId === where.organizationId && (!where.id || where.id.in.includes(c.id)),
        ),
      ),
    },
    automationRule: {
      findMany: jest.fn(async ({ where }: any) =>
        rules.filter((r) => r.organizationId === where.organizationId && r.enabled),
      ),
      update: jest.fn(async ({ where, data }: any) =>
        Object.assign(
          rules.find((r) => r.id === where.id),
          data,
        ),
      ),
    },
  };
  const svc = () => new AutomationService(prisma, schedule as any, publishing as any);
  const rule = (over: Record<string, unknown> = {}): any => {
    const r = {
      id: randomUUID(),
      organizationId: ORG_A,
      name: 'Rule',
      enabled: true,
      kinds: [],
      mode: 'now',
      slot: null,
      timezone: 'UTC',
      channelIds: [CH1],
      ...over,
    };
    rules.push(r);
    return r;
  };
  const now = new Date('2027-01-15T10:00:00Z');

  beforeEach(() => {
    rules = [];
    channels = [
      { id: CH1, organizationId: ORG_A, name: 'Main page', status: 'CONNECTED' },
      { id: CH2, organizationId: ORG_A, name: 'LinkedIn', status: 'CONNECTED' },
    ];
    piece = { id: CONTENT, organizationId: ORG_A, kind: 'FACEBOOK', approvalStatus: 'APPROVED' };
    schedule.schedule.mockReset().mockResolvedValue({});
    publishing.queue.mockReset().mockResolvedValue([]);
  });

  it('publishes straight away when the rule says now', async () => {
    const r = rule({ channelIds: [CH1, CH2] });
    const out = await svc().onApproved(ORG_A, U_ADMIN, CONTENT, now);
    expect(schedule.schedule).not.toHaveBeenCalled();
    expect(publishing.queue).toHaveBeenCalledTimes(2);
    expect(publishing.queue.mock.calls[0]).toEqual([
      ORG_A,
      U_ADMIN,
      { contentId: CONTENT, channelIds: [CH1], when: 'now' },
      now,
    ]);
    expect(out[0].result).toBe('Queued for Main page, LinkedIn.');
    expect(r.lastResult).toBe('Queued for Main page, LinkedIn.');
    expect(r.lastRunAt).toEqual(now);
  });

  it('waits for the next daily time when the rule has a slot', async () => {
    rule({ mode: 'slot', slot: '09:00', timezone: 'Europe/Paris' });
    await svc().onApproved(ORG_A, U_ADMIN, CONTENT, now);
    expect(schedule.schedule).toHaveBeenCalledWith(
      ORG_A,
      CONTENT,
      U_ADMIN,
      new Date('2027-01-16T08:00:00.000Z'),
      now,
    );
    expect(publishing.queue.mock.calls[0][2]).toEqual({
      contentId: CONTENT,
      channelIds: [CH1],
      when: 'scheduled',
    });
  });

  it('only applies to the kinds it names, and to all kinds when none are named', async () => {
    rule({ kinds: ['ARTICLE'], name: 'Articles only' });
    expect(await svc().onApproved(ORG_A, U_ADMIN, CONTENT, now)).toEqual([]);
    expect(publishing.queue).not.toHaveBeenCalled();
    rule({ kinds: [], name: 'Everything' });
    const out = await svc().onApproved(ORG_A, U_ADMIN, CONTENT, now);
    expect(out.map((o) => o.rule)).toEqual(['Everything']);
  });

  it('ignores disabled rules and other organizations', async () => {
    rule({ enabled: false });
    rule({ organizationId: ORG_B });
    expect(await svc().onApproved(ORG_A, U_ADMIN, CONTENT, now)).toEqual([]);
    expect(publishing.queue).not.toHaveBeenCalled();
  });

  it('does nothing for content that is not approved', async () => {
    piece = { ...piece, approvalStatus: 'IN_REVIEW' };
    rule();
    expect(await svc().onApproved(ORG_A, U_ADMIN, CONTENT, now)).toEqual([]);
    expect(publishing.queue).not.toHaveBeenCalled();
  });

  it('skips channels that need reconnecting and says so', async () => {
    channels[1].status = 'ERROR';
    const r = rule({ channelIds: [CH1, CH2] });
    await svc().onApproved(ORG_A, U_ADMIN, CONTENT, now);
    expect(publishing.queue).toHaveBeenCalledTimes(1);
    expect(r.lastResult).toBe(
      'Queued for Main page. 1 channel(s) skipped because they need reconnecting.',
    );
  });

  it('keeps going when one channel refuses, and reports why', async () => {
    publishing.queue.mockImplementation(async (_o: string, _a: string, input: any) => {
      if (input.channelIds[0] === CH2) throw new Error('This content does not meet the rules');
      return [];
    });
    const r = rule({ channelIds: [CH1, CH2] });
    await svc().onApproved(ORG_A, U_ADMIN, CONTENT, now);
    expect(r.lastResult).toBe(
      'Queued for Main page. Not queued: LinkedIn: This content does not meet the rules',
    );
  });

  it('stays quiet about content already queued or a channel that cannot take this kind', async () => {
    publishing.queue.mockImplementation(async (_o: string, _a: string, input: any) => {
      throw new Error(
        input.channelIds[0] === CH1
          ? 'Already waiting to be published to "x"'
          : 'The channel "y" cannot publish this type of content',
      );
    });
    const r = rule({ channelIds: [CH1, CH2] });
    await svc().onApproved(ORG_A, U_ADMIN, CONTENT, now);
    expect(r.lastResult).toBe('Nothing was queued.');
  });

  it('never throws, even when scheduling fails, and records the failure', async () => {
    schedule.schedule.mockRejectedValue(new Error('Choose a date and time in the future'));
    const r = rule({ mode: 'slot', slot: '09:00' });
    await expect(svc().onApproved(ORG_A, U_ADMIN, CONTENT, now)).resolves.toBeDefined();
    expect(r.lastResult).toBe('Failed: Choose a date and time in the future');
    expect(publishing.queue).not.toHaveBeenCalled();
  });

  it('never throws when the database is unavailable', async () => {
    prisma.automationRule.findMany.mockRejectedValueOnce(new Error('connection lost'));
    await expect(svc().onApproved(ORG_A, U_ADMIN, CONTENT, now)).resolves.toEqual([]);
  });
});

describe('automation rules API', () => {
  let app: INestApplication;
  let rules: any[];
  let channels: any[];
  let memberships: { userId: string; organizationId: string; role: Role }[];
  const CH_A = randomUUID();
  const CH_B = randomUUID();
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
      findMany: jest.fn(async ({ where }: any) =>
        channels.filter(
          (c) => c.organizationId === where.organizationId && where.id.in.includes(c.id),
        ),
      ),
    },
    automationRule: {
      findMany: jest.fn(async ({ where }: any) =>
        rules.filter((r) => r.organizationId === where.organizationId),
      ),
      count: jest.fn(
        async ({ where }: any) =>
          rules.filter((r) => r.organizationId === where.organizationId).length,
      ),
      create: jest.fn(async ({ data }: any) => {
        const r = {
          id: randomUUID(),
          createdAt: new Date(),
          lastRunAt: null,
          lastResult: null,
          ...data,
        };
        rules.push(r);
        return r;
      }),
      findFirst: jest.fn(
        async ({ where }: any) =>
          rules.find((r) => r.id === where.id && r.organizationId === where.organizationId) ?? null,
      ),
      update: jest.fn(async ({ where, data }: any) =>
        Object.assign(
          rules.find((r) => r.id === where.id),
          data,
        ),
      ),
      delete: jest.fn(async ({ where }: any) => {
        rules = rules.filter((r) => r.id !== where.id);
      }),
    },
  };
  const as = (id: string) => `Bearer user:${id}`;
  const base = `/api/organizations/${ORG_A}/automation-rules`;
  const body = (over: Record<string, unknown> = {}) => ({
    name: 'Approved posts go out',
    kinds: ['FACEBOOK', 'FACEBOOK'],
    mode: 'slot',
    slot: '09:30',
    timezone: 'Africa/Casablanca',
    channelIds: [CH_A],
    ...over,
  });
  const create = (b: object, user = U_ADMIN) =>
    request(app.getHttpServer()).post(base).set('Authorization', as(user)).send(b);

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
    rules = [];
    channels = [
      { id: CH_A, organizationId: ORG_A },
      { id: CH_B, organizationId: ORG_B },
    ];
    memberships = [
      { userId: U_ADMIN, organizationId: ORG_A, role: Role.ADMIN },
      { userId: U_EDITOR, organizationId: ORG_A, role: Role.EDITOR },
      { userId: U_OTHER, organizationId: ORG_B, role: Role.OWNER },
    ];
  });

  it('creates, lists, edits and deletes a rule', async () => {
    const made = await create(body()).expect(201);
    expect(made.body).toMatchObject({
      name: 'Approved posts go out',
      enabled: true,
      kinds: ['FACEBOOK'], // duplicates removed
      mode: 'slot',
      slot: '09:30',
      timezone: 'Africa/Casablanca',
      createdById: U_ADMIN,
    });
    const list = await request(app.getHttpServer())
      .get(base)
      .set('Authorization', as(U_EDITOR))
      .expect(200);
    expect(list.body).toHaveLength(1);
    const off = await request(app.getHttpServer())
      .patch(`${base}/${made.body.id}`)
      .set('Authorization', as(U_ADMIN))
      .send({ enabled: false, mode: 'now', slot: null })
      .expect(200);
    expect(off.body).toMatchObject({ enabled: false, mode: 'now', slot: null });
    await request(app.getHttpServer())
      .delete(`${base}/${made.body.id}`)
      .set('Authorization', as(U_ADMIN))
      .expect(200);
    expect(rules).toHaveLength(0);
  });

  it('is managed by admins and owners only, and readable by everyone in the organization', async () => {
    await create(body(), U_EDITOR).expect(403);
    const made = await create(body()).expect(201);
    await request(app.getHttpServer())
      .patch(`${base}/${made.body.id}`)
      .set('Authorization', as(U_EDITOR))
      .send({ enabled: false })
      .expect(403);
    await request(app.getHttpServer()).get(base).expect(401);
    await request(app.getHttpServer()).get(base).set('Authorization', as(U_OTHER)).expect(404);
  });

  it('never points at a channel of another organization', async () => {
    const res = await create(body({ channelIds: [CH_B] })).expect(400);
    expect(String(res.body.message)).toMatch(/channels was not found/);
    await create(body({ channelIds: [CH_A, CH_B] })).expect(400);
    expect(rules).toHaveLength(0);
    const ok = await create(body()).expect(201);
    await request(app.getHttpServer())
      .patch(`${base}/${ok.body.id}`)
      .set('Authorization', as(U_ADMIN))
      .send({ channelIds: [CH_B] })
      .expect(400);
  });

  it('keeps rules private to their organization', async () => {
    const made = await create(body()).expect(201);
    const other = `/api/organizations/${ORG_B}/automation-rules`;
    await request(app.getHttpServer())
      .patch(`${other}/${made.body.id}`)
      .set('Authorization', as(U_OTHER))
      .send({ enabled: false })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`${other}/${made.body.id}`)
      .set('Authorization', as(U_OTHER))
      .expect(404);
    expect(rules[0].enabled).toBe(true);
  });

  it('rejects anything that is not a valid rule', async () => {
    const bad: object[] = [
      body({ name: 'x' }),
      body({ kinds: ['VIDEO'] }),
      body({ mode: 'whenever' }),
      body({ slot: '9:30' }),
      body({ slot: null }), // a daily rule needs its time
      body({ timezone: 'Mars/Olympus' }),
      body({ channelIds: [] }),
      body({ channelIds: ['not-an-id'] }),
      body({ channelIds: Array.from({ length: 11 }, () => randomUUID()) }),
    ];
    for (const b of bad) await create(b).expect(400);
    expect(rules).toHaveLength(0);
  });

  it('accepts "now" without a time and an empty kinds list (all kinds)', async () => {
    const r = await create(body({ mode: 'now', slot: null, kinds: [] })).expect(201);
    expect(r.body).toMatchObject({ mode: 'now', slot: null, kinds: [] });
  });

  it('stops at the limit per organization', async () => {
    for (let i = 0; i < MAX_RULES_PER_ORG; i++)
      rules.push({ id: randomUUID(), organizationId: ORG_A });
    const res = await create(body()).expect(409);
    expect(String(res.body.message)).toMatch(/up to 20 automation rules/);
  });

  it('answers 404 for an unknown rule and a malformed id', async () => {
    await request(app.getHttpServer())
      .patch(`${base}/${randomUUID()}`)
      .set('Authorization', as(U_ADMIN))
      .send({ enabled: false })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`${base}/nope`)
      .set('Authorization', as(U_ADMIN))
      .expect(404);
  });
});
