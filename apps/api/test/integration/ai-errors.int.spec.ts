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

// No provider keys exist in the integration environment (see test/helpers/env.ts), so these
// tests exercise the real failure path without ever contacting an AI service.
// Timeouts, quota exhaustion, retries and fallbacks are covered with mocked providers in
// src/ai/ai.spec.ts.
describe('AI provider error handling through the real API stack', () => {
  async function setup() {
    const admin = await seedUser('ai-admin@test.dev');
    const viewer = await seedUser('ai-viewer@test.dev');
    const org = await seedOrg('AI Org', [
      { userId: admin.id, role: Role.ADMIN },
      { userId: viewer.id, role: Role.VIEWER },
    ]);
    return { admin, viewer, org };
  }

  it('reports free-only mode with unconfigured providers and never exposes secrets', async () => {
    const { admin, org } = await setup();
    const res = await request(app.getHttpServer())
      .get(`/api/organizations/${org.id}/ai/status`)
      .set('Authorization', await bearer(admin.id, admin.email))
      .expect(200);
    expect(res.body.freeOnly).toBe(true);
    expect(JSON.stringify(res.body.providers)).not.toMatch(/key|token|secret/i);
    expect(JSON.stringify(res.body.providers)).toMatch(/not_configured|configured/i);
  });

  it('answers a clear client-visible error when no text provider is configured, and spends no quota', async () => {
    const { admin, org } = await setup();
    const res = await request(app.getHttpServer())
      .post(`/api/organizations/${org.id}/ai/test-text`)
      .set('Authorization', await bearer(admin.id, admin.email))
      .send({ prompt: 'Say hello' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(600);
    expect(res.status).not.toBe(200);
    expect(JSON.stringify(res.body)).toMatch(/not configured|configur/i);
    expect(await prisma().aiUsage.count({ where: { status: 'SUCCESS' } })).toBe(0);
  });

  it('rejects an invalid prompt before any provider is considered', async () => {
    const { admin, org } = await setup();
    await request(app.getHttpServer())
      .post(`/api/organizations/${org.id}/ai/test-text`)
      .set('Authorization', await bearer(admin.id, admin.email))
      .send({ prompt: '   ' })
      .expect(400);
    expect(await prisma().aiUsage.count()).toBe(0);
  });

  it('refuses paid models and keeps the stored settings unchanged', async () => {
    const { admin, org } = await setup();
    const res = await request(app.getHttpServer())
      .put(`/api/organizations/${org.id}/ai/settings`)
      .set('Authorization', await bearer(admin.id, admin.email))
      .send({ textModel: 'openai/gpt-4o' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await prisma().aiSetting.count()).toBe(0);
  });

  it('keeps AI administration away from non-admin members', async () => {
    const { viewer, org } = await setup();
    const auth = await bearer(viewer.id, viewer.email);
    await request(app.getHttpServer())
      .post(`/api/organizations/${org.id}/ai/test-text`)
      .set('Authorization', auth)
      .send({ prompt: 'hi' })
      .expect(403);
    await request(app.getHttpServer())
      .put(`/api/organizations/${org.id}/ai/settings`)
      .set('Authorization', auth)
      .send({ dailyTextLimit: 1 })
      .expect(403);
  });
});
