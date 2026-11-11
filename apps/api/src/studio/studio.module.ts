import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ApprovalsService } from './approvals.service';
import { StudioController } from './studio.controller';
import { StudioService } from './studio.service';

@Module({
  imports: [OrganizationsModule, AiModule],
  controllers: [StudioController],
  providers: [StudioService, ApprovalsService],
})
export class StudioModule {}
