import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ChannelProvider, ChannelStatus, PublishStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Publisher, PUBLISHERS } from './publisher';

@Injectable()
export class ChannelsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PUBLISHERS) private readonly publishers: Publisher[],
  ) {}

  /** Providers that can actually publish today. The others are listed so the UI can show them as coming. */
  available() {
    const ready = new Set(this.publishers.map((p) => p.provider));
    return Object.values(ChannelProvider).map((provider) => ({
      provider,
      available: ready.has(provider),
    }));
  }

  list(orgId: string) {
    return this.prisma.channel.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async find(orgId: string, id: string) {
    const c = await this.prisma.channel.findFirst({ where: { id, organizationId: orgId } });
    if (!c) throw new NotFoundException('Channel not found');
    return c;
  }

  create(orgId: string, actorId: string, input: { provider: ChannelProvider; name: string }) {
    if (!this.publishers.some((p) => p.provider === input.provider)) {
      throw new UnprocessableEntityException(
        `Publishing to ${input.provider.toLowerCase()} is not available yet. Use the test channel to try the workflow.`,
      );
    }
    return this.prisma.channel.create({
      data: {
        organizationId: orgId,
        createdById: actorId,
        provider: input.provider,
        name: input.name,
        status: ChannelStatus.CONNECTED,
      },
    });
  }

  async update(orgId: string, id: string, input: { name?: string; status?: ChannelStatus }) {
    const c = await this.find(orgId, id);
    const updated = await this.prisma.channel.update({
      where: { id: c.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.status !== undefined ? { status: input.status, lastError: null } : {}),
      },
    });
    // Pausing a channel must not let its waiting posts go out anyway.
    if (input.status && input.status !== ChannelStatus.CONNECTED) {
      await this.prisma.publishJob.updateMany({
        where: { channelId: c.id, status: PublishStatus.QUEUED },
        data: { status: PublishStatus.CANCELLED, lastError: 'The channel was disconnected' },
      });
    }
    return updated;
  }

  async remove(orgId: string, id: string) {
    const c = await this.find(orgId, id);
    await this.prisma.channel.delete({ where: { id: c.id } });
    return { removed: true };
  }
}
