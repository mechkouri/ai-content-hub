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
      return {
        provider,
        available: !!p && (!p.prepare || this.secrets.configured) && (p.ready?.() ?? true),
      };
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
    input: { provider: ChannelProvider; name: string; autoPublish?: boolean } & Record<
      string,
      unknown
    >,
  ): Promise<PublicChannel> {
    const { provider, name, autoPublish, ...details } = input;
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
        autoPublish: autoPublish ?? false,
      },
    });
    return toPublic(created);
  }

  /**
   * Gives a channel a new login (an expired token, a revoked password) without losing its history.
   * The new login must belong to the same site, Page or profile: a scheduled post must never quietly
   * start going to a different account. Nothing is changed unless the new login checks out.
   */
  async reconnect(
    orgId: string,
    id: string,
    details: Record<string, unknown>,
  ): Promise<PublicChannel> {
    const channel = await this.findRaw(orgId, id);
    const publisher = this.publishers.find((p) => p.provider === channel.provider);
    if (!publisher?.prepare || !publisher.reconnectInput) {
      throw new UnprocessableEntityException('This channel has no login to reconnect.');
    }
    if (!this.secrets.configured) this.secrets.encrypt({});
    const oldConfig = (channel.config ?? {}) as Record<string, unknown>;
    const prepared = await publisher.prepare(publisher.reconnectInput(oldConfig, details));

    const before = publisher.identity?.(oldConfig);
    const after = publisher.identity?.(prepared.config);
    if (before && after !== before) {
      throw new UnprocessableEntityException(
        'That login belongs to a different account than this channel. Add it as a new channel instead.',
      );
    }
    const updated = await this.prisma.channel.update({
      where: { id: channel.id },
      data: {
        config: { ...oldConfig, ...prepared.config } as any,
        credentials: prepared.secret ? this.secrets.encrypt(prepared.secret) : channel.credentials,
        status: ChannelStatus.CONNECTED,
        lastError: null,
      },
    });
    return toPublic(updated);
  }

  async update(
    orgId: string,
    id: string,
    input: { name?: string; status?: ChannelStatus; autoPublish?: boolean },
  ): Promise<PublicChannel> {
    const c = await this.findRaw(orgId, id);
    const updated = await this.prisma.channel.update({
      where: { id: c.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.autoPublish !== undefined ? { autoPublish: input.autoPublish } : {}),
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
