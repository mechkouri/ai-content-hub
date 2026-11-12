import { Injectable } from '@nestjs/common';
import { ChannelProvider } from '@prisma/client';
import { randomUUID } from 'crypto';
import { Publisher, PublishResult } from './publisher';

/**
 * The built-in test channel: accepts every kind of content, posts nothing anywhere, and returns a
 * fake id. The job keeps the exact text that would have been sent, so a whole workflow can be tried safely.
 */
@Injectable()
export class TestPublisher implements Publisher {
  readonly provider = ChannelProvider.TEST;

  supports() {
    return true;
  }

  async publish(): Promise<PublishResult> {
    return { externalId: `test-${randomUUID()}`, url: null };
  }
}
