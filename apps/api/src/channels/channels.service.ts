import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Channel, ChannelProvider, ChannelStatus, PublishStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Publisher, PUBLISHERS } from './publisher';
import { SecretsService } from './secrets.service';

/** A channel as the API shows it: the stored login is never included. */
export type PublicChannel = Omit<Channel, 'credentials'>;
export const toPublic = ({ credentials: _credentials, ...rest }: Channel): PublicChannel => rest;

@Injectable()
export class ChannelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretsService,
    @Inject(PUBLISHERS) private readonly publishers: Publisher[],
  ) {}

  /** Providers that can publish today. The others are listed so the UI can show them as coming. */
  available() {
    const ready = new Map(this.publishers.map((p) => [p.provider, p]));
    return Object.values(ChannelProvider).map((provider) => {
      const p = ready.get(provider);
      // A provider that needs a login can only be used once logins can be stored safely.
      return { provider, available: !!p && (!p.prepare || this.secrets.configured) };
    });
  }

  async list(orgId: string): Promise<PublicChannel[]> {
    const rows = await this.prisma.channel.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toPublic);
  }

  /** Internal: includes the stored login. Never return this from a controller. */
  async findRaw(orgId: string, id: string) {
    const c = await this.prisma.channel.findFirst({ where: { id, organizationId: orgId } });
    if (!c) throw new NotFoundException('Channel not found');
    return c;
  }

  async create(
    orgId: string,
    actorId: string,
    input: { provider: ChannelProvider; name: string } & Record<string, unknown>,
  ): Promise<PublicChannel> {
    const { provider, name, ...details } = input;
    const publisher = this.publishers.find((p) => p.provider === provider);
    if (!publisher) {
      throw new UnprocessableEntityException(
        `Publishing to ${String(provider).toLowerCase()} is not available yet. Use the test channel to try the workflow.`,
      );
    }
    let config: Record<string, unknown> = {};
    let credentials: string | null = null;
    if (publisher.prepare) {
      // Fail before contacting the site if the login could not be stored safely anyway.
      if (!this.secrets.configured) this.secrets.encrypt({});
      const prepared = await publisher.prepare(details);
      config = prepared.config;
      credentials = prepared.secret ? this.secrets.encrypt(prepared.secret) : null;
    }
    const created = await this.prisma.channel.create({
      data: {
        organizationId: orgId,
        createdById: actorId,
        provider,
        name,
        status: ChannelStatus.CONNECTED,
        config: config as any,
        credentials,
      },
    });
    return toPublic(created);
  }

  async update(
    orgId: string,
    id: string,
    input: { name?: string; status?: ChannelStatus },
  ): Promise<PublicChannel> {
    const c = await this.findRaw(orgId, id);
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
    return toPublic(updated);
  }

  async remove(orgId: string, id: string) {
    const c = await this.findRaw(orgId, id);
    await this.prisma.channel.delete({ where: { id: c.id } });
    return { removed: true };
  }
}
