import { Module } from '@nestjs/common';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';
import { PUBLISHERS } from './publisher';
import { PublishingService } from './publishing.service';
import { PublishingWorker } from './publishing.worker';
import { TestPublisher } from './test.publisher';

@Module({
  imports: [OrganizationsModule],
  controllers: [ChannelsController],
  providers: [
    TestPublisher,
    // Real providers (WordPress, Facebook, Instagram, LinkedIn) are added to this list as they are built.
    { provide: PUBLISHERS, useFactory: (t: TestPublisher) => [t], inject: [TestPublisher] },
    ChannelsService,
    PublishingService,
    PublishingWorker,
  ],
  exports: [PublishingService],
})
export class ChannelsModule {}
