import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { bearer, createTestApp, tokenFor } from '../helpers/app';
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

describe('authentication (real JWT verification, real database)', () => {
  const get = (auth?: string) => {
    const r = request(app.getHttpServer()).get('/api/me');
    return auth ? r.set('Authorization', auth) : r;
  };

  it('rejects a missing Authorization header', async () => {
    await get().expect(401);
  });

  it('rejects a non-bearer scheme and garbage tokens', async () => {
    await get('Basic abc').expect(401);
    await get('Bearer not-a-jwt').expect(401);
  });

  it('rejects a token signed with the wrong secret', async () => {
    const forged = await tokenFor(randomUUID(), 'x@test.dev', {
      secret: 'a-different-secret-value-0123456789',
    });
    await get(`Bearer ${forged}`).expect(401);
  });

  it('rejects an expired token', async () => {
    const expired = await tokenFor(randomUUID(), 'x@test.dev', { expiresIn: '-1m' });
    await get(`Bearer ${expired}`).expect(401);
  });

  it('rejects a token for another audience', async () => {
    const wrong = await tokenFor(randomUUID(), 'x@test.dev', { audience: 'anon' });
    await get(`Bearer ${wrong}`).expect(401);
  });

  it('does not create a user for a rejected token', async () => {
    await get('Bearer not-a-jwt').expect(401);
    expect(await prisma().user.count()).toBe(0);
  });

  it('accepts a valid token, provisions the user on first sight, and lowercases the email', async () => {
    const id = randomUUID();
    const res = await get(await bearer(id, 'Mixed.Case@Test.dev')).expect(200);
    expect(res.body.user).toEqual({ id, email: 'mixed.case@test.dev' });
    expect(res.body.memberships).toEqual([]);
    expect(await prisma().user.findUnique({ where: { id } })).toMatchObject({
      email: 'mixed.case@test.dev',
    });
  });
});
