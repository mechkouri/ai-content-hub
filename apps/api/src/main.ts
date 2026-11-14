import 'reflect-metadata';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load the repo-root .env (works from both src/ and dist/).
config({ path: resolve(__dirname, '../../../.env') });

import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { applyHardening } from './common/hardening';
import { loadEnv } from './config/env';

async function bootstrap() {
  const env = loadEnv();
  // Bodies are small JSON documents; uploads use multipart, which has its own limits.
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  // CORS first, so even a refused (too large) request is readable by the web app.
  app.enableCors({
    origin: env.WEB_ORIGIN,
    credentials: false,
    exposedHeaders: ['Retry-After', 'RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
  });
  app.use(json({ limit: '1mb' }), urlencoded({ extended: false, limit: '100kb' }));
  applyHardening(app, {
    production: env.NODE_ENV === 'production',
    ratePerMinute: env.RATE_LIMIT_PER_MINUTE,
    trustProxy: env.TRUST_PROXY === 'true',
  });
  // Stop cleanly on a deploy: finish the publishing run, close the database.
  app.enableShutdownHooks();
  app.setGlobalPrefix('api');
  await app.listen(env.API_PORT);
  console.log(`API listening on http://localhost:${env.API_PORT}/api`);
}

bootstrap();
