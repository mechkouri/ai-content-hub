import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../app.module';
import { loadEnv } from '../config/env';

describe('health', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });
  afterAll(() => app.close());

  it('GET /api/health returns ok', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(res.body.status).toBe('ok');
  });

  it('env defaults and validation', () => {
    expect(loadEnv({}).API_PORT).toBe(4000);
    expect(() => loadEnv({ API_PORT: 'abc' })).toThrow();
    // Empty values from `KEY=` lines in .env must count as unset, not as invalid.
    expect(
      loadEnv({ SUPABASE_JWT_SECRET: '', SUPABASE_JWKS_URL: '' }).SUPABASE_JWT_SECRET,
    ).toBeUndefined();
  });
});
