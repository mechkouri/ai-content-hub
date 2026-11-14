import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ApprovalStatus, ChannelStatus, ContentKind, Prisma } from '@prisma/client';
import { PublishingService } from '../channels/publishing.service';
import { PrismaService } from '../prisma/prisma.service';
import { nextSlot } from './automation-timing';
import { ScheduleService } from './schedule.service';

export const MAX_RULES_PER_ORG = 20;
/** A daily time is never set closer to now than this, so there is always a moment to unapprove. */
export const MIN_LEAD_MINUTES = 15;

export interface RuleInput {
  name: string;
  enabled: boolean;
  kinds: ContentKind[];
  mode: 'now' | 'slot';
  slot: string | null;
  timezone: string;
  channelIds: string[];
}

/**
 * Workflow automation: "when content of this kind is approved, publish it to these channels, now or at the
 * next daily time". It only ever acts on content a person has approved, through the same scheduling and
 * publishing code as the buttons, so every safety rule (network checks, duplicate protection) still applies.
 */
@Injectable()
export class AutomationService {
  private readonly log = new Logger(AutomationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly schedule: ScheduleService,
    private readonly publishing: PublishingService,
  ) {}

  list(orgId: string) {
    return this.prisma.automationRule.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** The channels must exist in this organization: a rule can never point at somebody else's channel. */
  private async checkChannels(orgId: string, ids: string[]) {
    const found = await this.prisma.channel.findMany({
      where: { organizationId: orgId, id: { in: ids } },
    });
    if (found.length !== new Set(ids).size) {
      throw new BadRequestException('One of the channels was not found');
    }
  }

  async create(orgId: string, actorId: string, input: RuleInput) {
    const count = await this.prisma.automationRule.count({ where: { organizationId: orgId } });
    if (count >= MAX_RULES_PER_ORG) {
      throw new ConflictException(
        `An organization can keep up to ${MAX_RULES_PER_ORG} automation rules. Delete one first.`,
      );
    }
    await this.checkChannels(orgId, input.channelIds);
    return this.prisma.automationRule.create({
      data: { ...input, organizationId: orgId, createdById: actorId },
    });
  }

  private async find(orgId: string, id: string) {
    const rule = await this.prisma.automationRule.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!rule) throw new NotFoundException('Automation rule not found');
    return rule;
  }

  async update(orgId: string, id: string, input: Partial<RuleInput>) {
    await this.find(orgId, id);
    if (input.channelIds) await this.checkChannels(orgId, input.channelIds);
    return this.prisma.automationRule.update({ where: { id }, data: input });
  }

  async remove(orgId: string, id: string) {
    await this.find(orgId, id);
    await this.prisma.automationRule.delete({ where: { id } });
    return { ok: true };
  }

  /**
   * Called right after a person approves content. Never throws: a problem with an automation must not undo or
   * hide the approval. What happened is kept on the rule so people can see it.
   */
  async onApproved(orgId: string, actorId: string, contentId: string, now = new Date()) {
    let rules: Awaited<ReturnType<AutomationService['list']>>;
    try {
      const piece = await this.prisma.contentPiece.findFirst({
        where: { id: contentId, organizationId: orgId },
      });
      if (!piece || piece.approvalStatus !== ApprovalStatus.APPROVED) return [];
      const all = await this.prisma.automationRule.findMany({
        where: { organizationId: orgId, enabled: true },
        orderBy: { createdAt: 'asc' },
      });
      rules = all.filter((r) => r.kinds.length === 0 || r.kinds.includes(piece.kind));
    } catch (e) {
      this.log.warn(`Automation lookup failed: ${e instanceof Error ? e.message : e}`);
      return [];
    }

    const results: { rule: string; result: string }[] = [];
    for (const rule of rules) {
      const result = await this.runRule(orgId, actorId, contentId, rule, now);
      results.push({ rule: rule.name, result });
      try {
        await this.prisma.automationRule.update({
          where: { id: rule.id },
          data: { lastRunAt: now, lastResult: result.slice(0, 500) },
        });
      } catch {
        // the record is a convenience; the work is already done
      }
    }
    return results;
  }

  private async runRule(
    orgId: string,
    actorId: string,
    contentId: string,
    rule: { id: string; mode: string; slot: string | null; timezone: string; channelIds: string[] },
    now: Date,
  ): Promise<string> {
    try {
      const channels = await this.prisma.channel.findMany({
        where: { organizationId: orgId, id: { in: rule.channelIds } },
      });
      const usable = channels.filter((c) => c.status === ChannelStatus.CONNECTED);
      if (usable.length === 0) return 'No connected channel to publish to.';
      const when: 'now' | 'scheduled' = rule.mode === 'slot' ? 'scheduled' : 'now';
      if (rule.mode === 'slot') {
        if (!rule.slot) return 'The rule has no daily time.';
        const at = nextSlot(now, rule.slot, rule.timezone, MIN_LEAD_MINUTES);
        await this.schedule.schedule(orgId, contentId, actorId, at, now);
      }
      const done: string[] = [];
      const problems: string[] = [];
      for (const c of usable) {
        try {
          await this.publishing.queue(orgId, actorId, { contentId, channelIds: [c.id], when }, now);
          done.push(c.name);
        } catch (e) {
          const reason = e instanceof Error ? e.message : 'Could not be queued';
          if (/^Already /.test(reason) || /cannot publish this type/.test(reason)) continue;
          const detail = (e as { getResponse?: () => { errors?: string[] } })?.getResponse?.()
            ?.errors;
          problems.push(
            `${c.name}: ${Array.isArray(detail) && detail.length ? detail.join(' ') : reason}`,
          );
        }
      }
      const skippedClosed = channels.length - usable.length;
      return [
        done.length ? `Queued for ${done.join(', ')}.` : 'Nothing was queued.',
        problems.length ? `Not queued: ${problems.join(' | ')}` : '',
        skippedClosed ? `${skippedClosed} channel(s) skipped because they need reconnecting.` : '',
      ]
        .filter(Boolean)
        .join(' ');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Automation failed';
      this.log.warn(`Rule ${rule.id} failed: ${message}`);
      return `Failed: ${message}`;
    }
  }
}

export type { Prisma };
