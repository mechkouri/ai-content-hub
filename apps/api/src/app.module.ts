import { Module } from '@nestjs/common';
import { AiModule } from './ai/ai.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AuthModule } from './auth/auth.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { DesignModule } from './design/design.module';
import { ChannelsModule } from './channels/channels.module';
import { BrandModule } from './brand/brand.module';
import { HealthController } from './health/health.controller';
import { OrganizationsModule } from './organizations/organizations.module';
import { PrismaModule } from './prisma/prisma.service';
import { SourcesModule } from './sources/sources.module';
import { StudioModule } from './studio/studio.module';
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
    StudioModule,
    CampaignsModule,
    DesignModule,
    ChannelsModule,
    AnalyticsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
