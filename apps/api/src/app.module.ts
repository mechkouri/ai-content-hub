import { Module } from '@nestjs/common';
import { AiModule } from './ai/ai.module';
import { AuthModule } from './auth/auth.module';
import { BrandModule } from './brand/brand.module';
import { HealthController } from './health/health.controller';
import { OrganizationsModule } from './organizations/organizations.module';
import { PrismaModule } from './prisma/prisma.service';
import { SourcesModule } from './sources/sources.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    PrismaModule,
    StorageModule,
    AuthModule,
    OrganizationsModule,
    BrandModule,
    AiModule,
    SourcesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
