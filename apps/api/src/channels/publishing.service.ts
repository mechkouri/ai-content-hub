import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApprovalStatus, ChannelStatus, Prisma, PublishStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE, StorageProvider } from '../storage/storage';
import { ChannelAuthError, PermanentPublishError, Publisher, PUBLISHERS } from './publisher';
import { SecretsService } from './secrets.service';
import { checkPost, renderPost } from './publishing-rules';

export const MAX_ATTEMPTS = 3;
/** Wait before retry n (minutes): 5, 10. After the last attempt the job is marked failed. */
const backoffMs = (attempt: number) => attempt * 5 * 60_000;
/** A job stuck "publishing" this long was interrupted. It is failed, never re-sent blindly, to avoid double posts. */
const STUCK_MS = 15 * 60_000;
const BATCH = 20;

@Injectable()
export class PublishingService {
  private readonly log = new Logger('Publishing');

  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretsService,
    @Inject(STORAGE) private readonly storage: StorageProvider,
    @Inject(PUBLISHERS) private readonly publishers: Publisher[],
  ) {}

  private publisherFor(provider: string) {
    return this.publishers.find((p) => p.provider === provider);
  }

  // ---------- queueing ----------

  /** Queue one piece of approved content for one or more channels. All channels are checked before any job is created. */
  async queue(
    orgId: string,
    actorId: string,
    input: { contentId: string; channelIds: string[]; when: 'now' | 'scheduled' },
    now = new Date(),
  ) {
    const piece = await this.prisma.contentPiece.findFirst({
      where: { id: input.contentId, organizationId: orgId },
    });
    if (!piece) throw new NotFoundException('Content not found');
    if (piece.approvalStatus !== ApprovalStatus.APPROVED) {
      throw new ConflictException('Only approved content can be published');
    }
    let runAt = now;
    if (input.when === 'scheduled') {
      if (!piece.scheduledFor) {
        throw new ConflictException('Schedule this content in the calendar first');
      }
      if (piece.scheduledFor.getTime() <= now.getTime()) {
        throw new ConflictException('The scheduled time has passed: reschedule it or publish now');
      }
      runAt = piece.scheduledFor;
    }

    const payload = renderPost(piece.kind, piece.title, piece.content, piece.language);
    const check = checkPost(piece.kind, piece.content, payload);
    if (check.errors.length) {
      throw new UnprocessableEntityException({
        message: 'This content does not meet the rules of the network',
        errors: check.errors,
        warnings: check.warnings,
      });
    }

    const ids = [...new Set(input.channelIds)];
    const prepared: { channelId: string; existing: any }[] = [];
    for (const channelId of ids) {
      const channel = await this.prisma.channel.findFirst({
        where: { id: channelId, organizationId: orgId },
      });
      if (!channel) throw new NotFoundException('Channel not found');
      if (channel.status !== ChannelStatus.CONNECTED) {
        throw new ConflictException(`The channel "${channel.name}" is not connected`);
      }
      const publisher = this.publisherFor(channel.provider);
      if (!publisher) throw new UnprocessableEntityException('This channel cannot publish yet');
      if (!publisher.supports(piece.kind)) {
        throw new UnprocessableEntityException(
          `The channel "${channel.name}" cannot publish this type of content`,
        );
      }
      const existing = await this.prisma.publishJob.findFirst({
        where: { contentId: piece.id, channelId },
      });
      if (existing?.status === PublishStatus.PUBLISHED) {
        throw new ConflictException(`Already published to "${channel.name}"`);
      }
      if (
        existing &&
        (existing.status === PublishStatus.QUEUED || existing.status === PublishStatus.PUBLISHING)
      ) {
        throw new ConflictException(`Already waiting to be published to "${channel.name}"`);
      }
      prepared.push({ channelId, existing });
    }

    const jobs = [];
    for (const { channelId, existing } of prepared) {
      const data = {
        status: PublishStatus.QUEUED,
        runAt,
        followsSchedule: input.when === 'scheduled',
        attempts: 0,
        lastError: null,
        payload: payload as unknown as Prisma.InputJsonValue,
        externalId: null,
        externalUrl: null,
        publishedAt: null,
      };
      jobs.push(
        existing
          ? await this.prisma.publishJob.update({ where: { id: existing.id }, data })
          : await this.prisma.publishJob.create({
              data: {
                ...data,
                organizationId: orgId,
                contentId: piece.id,
                channelId,
                createdById: actorId,
              },
            }),
      );
    }
    return { jobs, warnings: check.warnings };
  }

  /**
   * Queues scheduled content to every connected channel that has automatic publishing on. Each channel is
   * tried on its own, so one that cannot take this content (wrong type, network rules) never blocks the others.
   * Channels that already have this content waiting or published are skipped without a message.
   */
  async queueAuto(orgId: string, actorId: string, contentId: string, now = new Date()) {
    const channels = await this.prisma.channel.findMany({
      where: { organizationId: orgId, autoPublish: true, status: ChannelStatus.CONNECTED },
    });
    const queued: string[] = [];
    const skipped: { channel: string; reason: string }[] = [];
    for (const c of channels) {
      try {
        await this.queue(orgId, actorId, { contentId, channelIds: [c.id], when: 'scheduled' }, now);
        queued.push(c.name);
      } catch (e) {
        const reason = e instanceof Error ? e.message : 'Could not be queued';
        if (/^Already /.test(reason)) continue;
        // A kind this channel never publishes (an article for a Facebook page) is expected, not a problem.
        if (/cannot publish this type/.test(reason)) continue;
        const detail = (e as any)?.getResponse?.()?.errors;
        skipped.push({
          channel: c.name,
          reason: Array.isArray(detail) && detail.length ? detail.join(' ') : reason,
        });
      }
    }
    return { queued, skipped };
  }

  list(orgId: string, filter: { contentId?: string; status?: PublishStatus }) {
    return this.prisma.publishJob.findMany({
      where: {
        organizationId: orgId,
        ...(filter.contentId ? { contentId: filter.contentId } : {}),
        ...(filter.status ? { status: filter.status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  private async findJob(orgId: string, id: string) {
    const job = await this.prisma.publishJob.findFirst({ where: { id, organizationId: orgId } });
    if (!job) throw new NotFoundException('Publish job not found');
    return job;
  }

  async cancel(orgId: string, id: string) {
    const job = await this.findJob(orgId, id);
    if (job.status !== PublishStatus.QUEUED) {
      throw new ConflictException('Only waiting posts can be cancelled');
    }
    // Atomic: a worker that already claimed the job wins and nothing is cancelled.
    const res = await this.prisma.publishJob.updateMany({
      where: { id: job.id, status: PublishStatus.QUEUED },
      data: { status: PublishStatus.CANCELLED, lastError: 'Cancelled' },
    });
    if (res.count === 0) throw new ConflictException('This post just started publishing');
    return this.findJob(orgId, id);
  }

  async retry(orgId: string, id: string, now = new Date()) {
    const job = await this.findJob(orgId, id);
    if (job.status !== PublishStatus.FAILED && job.status !== PublishStatus.CANCELLED) {
      throw new ConflictException('Only failed or cancelled posts can be retried');
    }
    const piece = await this.prisma.contentPiece.findFirst({
      where: { id: job.contentId, organizationId: orgId },
    });
    if (!piece || piece.approvalStatus !== ApprovalStatus.APPROVED) {
      throw new ConflictException('The content is no longer approved');
    }
    return this.prisma.publishJob.update({
      where: { id: job.id },
      data: {
        status: PublishStatus.QUEUED,
        runAt: now,
        followsSchedule: false,
        attempts: 0,
        lastError: null,
      },
    });
  }

  // ---------- running ----------

  /** Publishes everything that is due. Safe to run from several processes: each job is claimed atomically. */
  async processDue(now = new Date()) {
    await this.failStuck(now);
    const due = await this.prisma.publishJob.findMany({
      where: { status: PublishStatus.QUEUED, runAt: { lte: now } },
      orderBy: { runAt: 'asc' },
      take: BATCH,
    });
    let published = 0;
    for (const job of due) {
      if (await this.run(job.id, now)) published++;
    }
    return { due: due.length, published };
  }

  private async failStuck(now: Date) {
    await this.prisma.publishJob.updateMany({
      where: {
        status: PublishStatus.PUBLISHING,
        updatedAt: { lt: new Date(now.getTime() - STUCK_MS) },
      },
      data: {
        status: PublishStatus.FAILED,
        lastError:
          'Interrupted. Check the channel for this post before retrying, to avoid posting twice.',
      },
    });
  }

  private async run(jobId: string, now: Date): Promise<boolean> {
    const claimed = await this.prisma.publishJob.updateMany({
      where: { id: jobId, status: PublishStatus.QUEUED },
      data: { status: PublishStatus.PUBLISHING, attempts: { increment: 1 } },
    });
    if (claimed.count === 0) return false; // another worker, or cancelled, got there first
    const job = await this.prisma.publishJob.findFirst({ where: { id: jobId } });
    if (!job) return false;

    const fail = (message: string, permanent: boolean) =>
      this.prisma.publishJob.update({
        where: { id: job.id },
        data:
          permanent || job.attempts >= MAX_ATTEMPTS
            ? { status: PublishStatus.FAILED, lastError: message }
            : {
                status: PublishStatus.QUEUED,
                lastError: message,
                runAt: new Date(now.getTime() + backoffMs(job.attempts)),
              },
      });

    const [piece, channel] = await Promise.all([
      this.prisma.contentPiece.findFirst({ where: { id: job.contentId } }),
      this.prisma.channel.findFirst({ where: { id: job.channelId } }),
    ]);
    if (!piece || piece.approvalStatus !== ApprovalStatus.APPROVED) {
      await this.prisma.publishJob.update({
        where: { id: job.id },
        data: { status: PublishStatus.CANCELLED, lastError: 'The content is no longer approved' },
      });
      return false;
    }
    const publisher = channel && this.publisherFor(channel.provider);
    if (!channel || channel.status !== ChannelStatus.CONNECTED || !publisher) {
      await fail('The channel is not connected', true);
      return false;
    }

    try {
      // Re-rendered from the current text, so the post is always what was approved.
      const payload = renderPost(piece.kind, piece.title, piece.content, piece.language);
      const secret = channel.credentials ? this.secrets.decrypt(channel.credentials) : null;
      const media = await this.loadMedia(piece.id);
      const result = await publisher.publish(
        { id: channel.id, name: channel.name, config: channel.config, secret },
        payload,
        media,
      );
      await this.prisma.publishJob.update({
        where: { id: job.id },
        data: {
          status: PublishStatus.PUBLISHED,
          publishedAt: new Date(),
          payload: { ...payload, imageCount: media.length } as unknown as Prisma.InputJsonValue,
          externalId: result.externalId,
          externalUrl: result.url ?? null,
          lastError: null,
        },
      });
      return true;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Publishing failed';
      this.log.warn(`Job ${job.id} failed (attempt ${job.attempts}): ${message}`);
      if (e instanceof ChannelAuthError) {
        // The login stopped working: stop every further post to this channel until it is reconnected.
        await this.prisma.channel.update({
          where: { id: channel.id },
          data: { status: ChannelStatus.ERROR, lastError: message.slice(0, 500) },
        });
        await this.prisma.publishJob.updateMany({
          where: { channelId: channel.id, status: PublishStatus.QUEUED },
          data: {
            status: PublishStatus.CANCELLED,
            lastError: 'The channel needs to be reconnected',
          },
        });
      }
      await fail(message.slice(0, 500), e instanceof PermanentPublishError);
      return false;
    }
  }

  /** The content's pictures, in order, read from storage just before posting. */
  private async loadMedia(contentId: string) {
    const rows = await this.prisma.contentImage.findMany({
      where: { contentId },
      include: { asset: true },
      orderBy: { position: 'asc' },
    });
    return Promise.all(
      rows.map(async (r: any) => ({
        filename: r.asset.filename as string,
        mimeType: r.asset.mimeType as string,
        data: await this.storage.get(r.asset.storageKey),
        altText: (r.altText as string | null) ?? undefined,
      })),
    );
  }

  // ---------- keeping jobs in step with their content ----------

  /** Content was edited or un-approved: nothing waiting may go out with the old approval. */
  cancelForContent(contentId: string, reason: string) {
    return this.prisma.publishJob.updateMany({
      where: { contentId, status: PublishStatus.QUEUED },
      data: { status: PublishStatus.CANCELLED, lastError: reason },
    });
  }

  /** Jobs queued "at the scheduled time" move when the content is rescheduled. */
  rescheduleForContent(contentId: string, runAt: Date) {
    return this.prisma.publishJob.updateMany({
      where: { contentId, status: PublishStatus.QUEUED, followsSchedule: true },
      data: { runAt },
    });
  }

  cancelScheduledForContent(contentId: string) {
    return this.prisma.publishJob.updateMany({
      where: { contentId, status: PublishStatus.QUEUED, followsSchedule: true },
      data: { status: PublishStatus.CANCELLED, lastError: 'The schedule was removed' },
    });
  }
}
