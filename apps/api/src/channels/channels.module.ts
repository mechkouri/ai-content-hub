import { Module } from '@nestjs/common';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';
import { PUBLISHERS } from './publisher';
import { FacebookPublisher } from './facebook.publisher';
import { HTTP_CLIENT, makeSafeJsonRequest } from './safe-request';
import { SecretsService } from './secrets.service';
import { PublishingService } from './publishing.service';
import { PublishingWorker } from './publishing.worker';
import { TestPublisher } from './test.publisher';
import { WordPressPublisher } from './wordpress.publisher';

@Module({
  imports: [OrganizationsModule],
  controllers: [ChannelsController],
  providers: [
    SecretsService,
    { provide: HTTP_CLIENT, useValue: makeSafeJsonRequest() },
    TestPublisher,
    WordPressPublisher,
    FacebookPublisher,
    // Instagram and LinkedIn are added to this list as they are built.
    {
      provide: PUBLISHERS,
      useFactory: (t: TestPublisher, w: WordPressPublisher, f: FacebookPublisher) => [t, w, f],
      inject: [TestPublisher, WordPressPublisher, FacebookPublisher],
    },
    ChannelsService,
    PublishingService,
    PublishingWorker,
  ],
  exports: [PublishingService],
})
export class ChannelsModule {}
