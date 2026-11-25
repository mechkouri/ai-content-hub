import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { PAGE_FETCHER, defaultPageFetcher } from '../sources/sources.service';
import { StrategyController } from './strategy.controller';
import { StrategyService } from './strategy.service';

@Module({
  imports: [OrganizationsModule, AiModule],
  controllers: [StrategyController],
  providers: [StrategyService, { provide: PAGE_FETCHER, useValue: defaultPageFetcher }],
})
export class StrategyModule {}
