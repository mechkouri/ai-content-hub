import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health/health.controller';
import { OrganizationsModule } from './organizations/organizations.module';
import { PrismaModule } from './prisma/prisma.service';

@Module({
  imports: [PrismaModule, AuthModule, OrganizationsModule],
  controllers: [HealthController],
})
export class AppModule {}
