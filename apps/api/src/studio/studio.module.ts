import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { ChannelsModule } from '../channels/channels.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ApprovalsService } from './approvals.service';
import { ScheduleService } from './schedule.service';
import { StudioController } from './studio.controller';
import { StudioService } from './studio.service';

@Module({
  imports: [OrganizationsModule, AiModule, ChannelsModule],
  controllers: [StudioController],
  providers: [StudioService, ApprovalsService, ScheduleService],
})
export class StudioModule {}
