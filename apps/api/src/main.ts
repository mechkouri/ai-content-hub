import 'reflect-metadata';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load the repo-root .env (works from both src/ and dist/).
config({ path: resolve(__dirname, '../../../.env') });

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { loadEnv } from './config/env';

async function bootstrap() {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors({ origin: env.WEB_ORIGIN, credentials: false });
  await app.listen(env.API_PORT);
  console.log(`API listening on http://localhost:${env.API_PORT}/api`);
}

bootstrap();
