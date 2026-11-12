import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { BrandModule } from '../brand/brand.module';
import { ChannelsModule } from '../channels/channels.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ApprovalsService } from './approvals.service';
import { ImagesService } from './images.service';
import { ScheduleService } from './schedule.service';
import { StudioController } from './studio.controller';
import { StudioService } from './studio.service';

@Module({
  imports: [OrganizationsModule, AiModule, ChannelsModule, BrandModule],
  controllers: [StudioController],
  providers: [StudioService, ApprovalsService, ScheduleService, ImagesService],
})
export class StudioModule {}
