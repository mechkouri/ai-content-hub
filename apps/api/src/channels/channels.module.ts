import { Module } from '@nestjs/common';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';
import { PUBLISHERS } from './publisher';
import { FacebookPublisher } from './facebook.publisher';
import { InstagramPublisher } from './instagram.publisher';
import { LinkedInPublisher } from './linkedin.publisher';
import { PUBLIC_MEDIA, SupabasePublicMedia } from './public-media';
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
    { provide: PUBLIC_MEDIA, useFactory: () => new SupabasePublicMedia() },
    FacebookPublisher,
    InstagramPublisher,
    LinkedInPublisher,
    {
      provide: PUBLISHERS,
      useFactory: (
        t: TestPublisher,
        w: WordPressPublisher,
        f: FacebookPublisher,
        i: InstagramPublisher,
        l: LinkedInPublisher,
      ) => [t, w, f, i, l],
      inject: [
        TestPublisher,
        WordPressPublisher,
        FacebookPublisher,
        InstagramPublisher,
        LinkedInPublisher,
      ],
    },
    ChannelsService,
    PublishingService,
    PublishingWorker,
  ],
  exports: [PublishingService],
})
export class ChannelsModule {}
