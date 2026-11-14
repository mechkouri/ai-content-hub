import { Controller, Get, INestApplication, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { applyHardening } from './hardening';

@Controller('ping')
class PingController {
  @Get()
  get() {
    return { ok: true };
  }
  @Post()
  post() {
    return { ok: true };
  }
}

async function appWith(opts: {
  ratePerMinute: number;
  trustProxy?: boolean;
  production?: boolean;
}) {
  const mod = await Test.createTestingModule({ controllers: [PingController] }).compile();
  const app = mod.createNestApplication();
  applyHardening(app, {
    production: opts.production ?? false,
    ratePerMinute: opts.ratePerMinute,
    trustProxy: opts.trustProxy ?? false,
  });
  app.setGlobalPrefix('api');
  await app.init();
  return app;
}

describe('security headers', () => {
  let app: INestApplication;
  afterEach(() => app.close());

  it('are on every answer, and the server does not announce what it is', async () => {
    app = await appWith({ ratePerMinute: 0 });
    const res = await request(app.getHttpServer()).get('/api/ping').expect(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['strict-transport-security']).toBeUndefined(); // only in production
  });

  it('add HTTPS-only in production', async () => {
    app = await appWith({ ratePerMinute: 0, production: true });
    const res = await request(app.getHttpServer()).get('/api/ping').expect(200);
    expect(res.headers['strict-transport-security']).toMatch(/max-age=\d+/);
  });

  it('are also on errors', async () => {
    app = await appWith({ ratePerMinute: 0 });
    const res = await request(app.getHttpServer()).get('/api/nothing-here').expect(404);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('rate limit', () => {
  let app: INestApplication;
  afterEach(() => app.close());

  it('lets a client through up to the limit, then answers 429 with when to retry', async () => {
    app = await appWith({ ratePerMinute: 3 });
    const get = () => request(app.getHttpServer()).get('/api/ping');
    for (const left of ['2', '1', '0']) {
      const ok = await get().expect(200);
      expect(ok.headers['ratelimit-limit']).toBe('3');
      expect(ok.headers['ratelimit-remaining']).toBe(left);
    }
    const blocked = await get().expect(429);
    expect(blocked.body.statusCode).toBe(429);
    expect(blocked.body.message).toMatch(/Too many requests/);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(blocked.body.retryAfterSeconds).toBe(Number(blocked.headers['retry-after']));
    // the count covers every method, not only GET
    await request(app.getHttpServer()).post('/api/ping').expect(429);
  });

  it('never limits the health check, so a load balancer is not locked out', async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) })
      .compile();
    app = mod.createNestApplication();
    applyHardening(app, { production: false, ratePerMinute: 1, trustProxy: false });
    app.setGlobalPrefix('api');
    await app.init();
    for (let i = 0; i < 5; i++) await request(app.getHttpServer()).get('/api/health').expect(200);
    for (let i = 0; i < 3; i++)
      await request(app.getHttpServer()).get('/api/health/ready').expect(200);
  });

  it('can be switched off', async () => {
    app = await appWith({ ratePerMinute: 0 });
    for (let i = 0; i < 20; i++) await request(app.getHttpServer()).get('/api/ping').expect(200);
  });

  it('counts each address on its own, but only believes X-Forwarded-For behind a proxy', async () => {
    app = await appWith({ ratePerMinute: 1, trustProxy: false });
    const hit = (ip: string) =>
      request(app.getHttpServer()).get('/api/ping').set('X-Forwarded-For', ip);
    await hit('1.1.1.1').expect(200);
    // not trusted: a spoofed address does not get a fresh allowance
    await hit('2.2.2.2').expect(429);
    await app.close();

    app = await appWith({ ratePerMinute: 1, trustProxy: true });
    await hit('1.1.1.1').expect(200);
    await hit('1.1.1.1').expect(429);
    await hit('2.2.2.2').expect(200); // a different client behind the proxy
  });
});

describe('rate limit window', () => {
  it('starts again after the window and forgets old clients', async () => {
    const { rateLimit } = await import('./hardening');
    let t = 1_000_000;
    const limiter = rateLimit({ limit: 2, windowMs: 60_000, now: () => t });
    const run = (ip: string) => {
      const res: any = {
        headers: {} as Record<string, string>,
        statusCode: 200,
        setHeader(k: string, v: string) {
          this.headers[k] = v;
        },
        status(c: number) {
          this.statusCode = c;
          return this;
        },
        json() {
          return this;
        },
      };
      let passed = false;
      limiter({ ip, method: 'GET', path: '/x', socket: {} } as any, res, () => (passed = true));
      return { passed, res };
    };
    expect(run('a').passed).toBe(true);
    expect(run('a').passed).toBe(true);
    const blocked = run('a');
    expect(blocked.passed).toBe(false);
    expect(blocked.res.statusCode).toBe(429);
    expect(blocked.res.headers['Retry-After']).toBe('60');
    t += 30_000;
    expect(run('a').res.headers['Retry-After']).toBe('30');
    t += 31_000; // the window has ended
    expect(run('a').passed).toBe(true);
    expect(run('a').res.headers['RateLimit-Remaining']).toBe('0');
    // preflight requests are never counted
    const options = { ip: 'b', method: 'OPTIONS', path: '/x', socket: {} } as any;
    let ok = 0;
    for (let i = 0; i < 10; i++) limiter(options, { setHeader() {} } as any, () => ok++);
    expect(ok).toBe(10);
  });
});

describe('readiness', () => {
  it('answers 503 when the database cannot be reached', async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: jest.fn().mockRejectedValue(new Error('connection refused')) })
      .compile();
    const app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    const res = await request(app.getHttpServer()).get('/api/health/ready').expect(503);
    expect(String(res.body.message)).toBe('The database is not reachable');
    // liveness stays green: the process is fine, it just must not receive traffic
    await request(app.getHttpServer()).get('/api/health').expect(200);
    await app.close();
  });
});
