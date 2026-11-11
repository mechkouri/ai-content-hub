import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { BrandModule } from './brand/brand.module';
import { HealthController } from './health/health.controller';
import { OrganizationsModule } from './organizations/organizations.module';
import { PrismaModule } from './prisma/prisma.service';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [PrismaModule, StorageModule, AuthModule, OrganizationsModule, BrandModule],
  controllers: [HealthController],
})
export class AppModule {}
