import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { loadEnv } from '../config/env';
import { PublishingService } from './publishing.service';

/** Checks for due posts on a timer. Never runs under test; can be switched off with PUBLISH_WORKER=off. */
@Injectable()
export class PublishingWorker implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('PublishingWorker');
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly publishing: PublishingService) {}

  onModuleInit() {
    const env = loadEnv();
    if (env.NODE_ENV === 'test' || env.PUBLISH_WORKER === 'off') return;
    this.timer = setInterval(() => void this.tick(), env.PUBLISH_POLL_SECONDS * 1000);
    this.timer.unref(); // never keeps the process alive on its own
    this.log.log(`Checking for due posts every ${env.PUBLISH_POLL_SECONDS}s`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.running) return; // a slow run must not overlap the next one
    this.running = true;
    try {
      const r = await this.publishing.processDue();
      if (r.due) this.log.log(`${r.published} of ${r.due} due posts published`);
    } catch (e) {
      this.log.error(`Publishing run failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      this.running = false;
    }
  }
}
