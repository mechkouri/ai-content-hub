import { Module } from '@nestjs/common';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';
import { PUBLISHERS } from './publisher';
import { FacebookPublisher } from './facebook.publisher';
import { LinkedInPublisher } from './linkedin.publisher';
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
    LinkedInPublisher,
    // Instagram is added to this list when public image storage exists.
    {
      provide: PUBLISHERS,
      useFactory: (
        t: TestPublisher,
        w: WordPressPublisher,
        f: FacebookPublisher,
        l: LinkedInPublisher,
      ) => [t, w, f, l],
      inject: [TestPublisher, WordPressPublisher, FacebookPublisher, LinkedInPublisher],
    },
    ChannelsService,
    PublishingService,
    PublishingWorker,
  ],
  exports: [PublishingService],
})
export class ChannelsModule {}
