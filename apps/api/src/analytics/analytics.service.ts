import { Injectable } from '@nestjs/common';
import { ApprovalStatus, PublishStatus, ReviewAction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const RANGES = [7, 30, 90] as const;
const DAY = 86_400_000;
const CAP = 5000;

const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const startOfUtcDay = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/**
 * What the organization has made and published, computed from its own records: no network is asked.
 * Days are UTC days, so the same data always gives the same chart. Reads are capped (5000 rows per kind).
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(orgId: string, days: number, now = new Date()) {
    const to = startOfUtcDay(now);
    const from = new Date(to.getTime() - (days - 1) * DAY);

    const [created, everything, reviews, jobs, channels] = await Promise.all([
      this.prisma.contentPiece.findMany({
        where: { organizationId: orgId, createdAt: { gte: from } },
        select: { kind: true, language: true },
        take: CAP,
      }),
      this.prisma.contentPiece.findMany({
        where: { organizationId: orgId },
        select: { approvalStatus: true },
        take: CAP,
      }),
      this.prisma.contentReview.findMany({
        where: {
          organizationId: orgId,
          createdAt: { gte: from },
          action: { in: [ReviewAction.SUBMITTED, ReviewAction.APPROVED] },
        },
        orderBy: { createdAt: 'asc' },
        select: { contentId: true, action: true, createdAt: true },
        take: CAP,
      }),
      this.prisma.publishJob.findMany({
        where: { organizationId: orgId, createdAt: { gte: from } },
        select: {
          id: true,
          contentId: true,
          channelId: true,
          status: true,
          publishedAt: true,
          updatedAt: true,
          lastError: true,
        },
        take: CAP,
      }),
      this.prisma.channel.findMany({
        where: { organizationId: orgId },
        select: { id: true, name: true, provider: true },
      }),
    ]);

    // Pipeline: where all content stands right now.
    const stage = (s: ApprovalStatus) => everything.filter((p) => p.approvalStatus === s).length;
    const pipeline = {
      draft: stage(ApprovalStatus.DRAFT),
      inReview: stage(ApprovalStatus.IN_REVIEW),
      changesRequested: stage(ApprovalStatus.CHANGES_REQUESTED),
      approved: stage(ApprovalStatus.APPROVED),
    };

    // Content made in the period.
    const count = (rows: Record<string, any>[], key: string) =>
      rows.reduce<Record<string, number>>(
        (acc, r) => ({ ...acc, [r[key]]: (acc[r[key]] ?? 0) + 1 }),
        {},
      );

    // Time to approval: from a submission to the approval that followed it.
    const submittedAt = new Map<string, Date>();
    const waits: number[] = [];
    for (const r of reviews) {
      if (r.action === ReviewAction.SUBMITTED) submittedAt.set(r.contentId, r.createdAt);
      else if (submittedAt.has(r.contentId)) {
        waits.push(r.createdAt.getTime() - submittedAt.get(r.contentId)!.getTime());
        submittedAt.delete(r.contentId);
      }
    }
    const avgMinutes = waits.length
      ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length / 60_000)
      : null;

    // Publishing per day: a post counts on the day it went out, a failure on the day it gave up.
    const byDay = Array.from({ length: days }, (_, i) => ({
      date: dayKey(new Date(from.getTime() + i * DAY)),
      published: 0,
      failed: 0,
    }));
    const index = new Map(byDay.map((d, i) => [d.date, i]));
    const names = new Map(channels.map((c) => [c.id, c]));
    const perChannel = new Map<string, { published: number; failed: number; queued: number }>();
    const bucket = (id: string) => {
      if (!perChannel.has(id)) perChannel.set(id, { published: 0, failed: 0, queued: 0 });
      return perChannel.get(id)!;
    };
    let published = 0;
    let failed = 0;
    let queued = 0;
    for (const j of jobs) {
      const b = bucket(j.channelId);
      if (j.status === PublishStatus.PUBLISHED && j.publishedAt) {
        published++;
        b.published++;
        const i = index.get(dayKey(j.publishedAt));
        if (i !== undefined) byDay[i].published++;
      } else if (j.status === PublishStatus.FAILED) {
        failed++;
        b.failed++;
        const i = index.get(dayKey(j.updatedAt));
        if (i !== undefined) byDay[i].failed++;
      } else if (j.status === PublishStatus.QUEUED || j.status === PublishStatus.PUBLISHING) {
        queued++;
        b.queued++;
      }
    }

    return {
      range: { days, from: dayKey(from), to: dayKey(to) },
      totals: { created: created.length, published, failed, queued },
      successRate: published + failed ? Math.round((published / (published + failed)) * 100) : null,
      pipeline,
      approval: { count: waits.length, avgMinutes },
      byDay,
      byChannel: [...perChannel.entries()]
        .map(([channelId, v]) => ({
          channelId,
          name: names.get(channelId)?.name ?? 'Removed channel',
          provider: names.get(channelId)?.provider ?? null,
          ...v,
        }))
        .sort((a, b) => b.published - a.published || a.name.localeCompare(b.name)),
      content: { byKind: count(created, 'kind'), byLanguage: count(created, 'language') },
      recentFailures: jobs
        .filter((j) => j.status === PublishStatus.FAILED)
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        .slice(0, 5)
        .map((j) => ({
          jobId: j.id,
          contentId: j.contentId,
          channel: names.get(j.channelId)?.name ?? 'Removed channel',
          error: j.lastError,
          at: j.updatedAt,
        })),
    };
  }
}
