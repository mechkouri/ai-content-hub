import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { SourcesController } from './sources.controller';
import { PAGE_FETCHER, SourcesService, defaultPageFetcher } from './sources.service';

@Module({
  imports: [OrganizationsModule, AiModule],
  controllers: [SourcesController],
  providers: [SourcesService, { provide: PAGE_FETCHER, useValue: defaultPageFetcher }],
})
export class SourcesModule {}
