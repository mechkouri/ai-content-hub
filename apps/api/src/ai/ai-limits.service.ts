import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { AiKind, AiStatus } from '@prisma/client';
import { loadEnv } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

export interface Limits {
  dailyText: number;
  monthlyText: number;
  dailyImage: number;
  monthlyImage: number;
}

const startOfDayUtc = (d = new Date()) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const startOfMonthUtc = (d = new Date()) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
const startOfNextDayUtc = (d = new Date()) => new Date(startOfDayUtc(d).getTime() + 86_400_000);
const startOfNextMonthUtc = (d = new Date()) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));

@Injectable()
export class AiLimitsService {
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly prisma: PrismaService) {}

  getSettings(orgId: string) {
    return this.prisma.aiSetting.findUnique({ where: { organizationId: orgId } });
  }

  /** Organization limits can only lower the platform caps, never raise them. */
  async effectiveLimits(orgId: string): Promise<Limits> {
    const env = loadEnv();
    const s = await this.getSettings(orgId);
    const cap = (platform: number, org?: number | null) =>
      org == null ? platform : Math.min(platform, org);
    return {
      dailyText: cap(env.AI_DAILY_TEXT_LIMIT, s?.dailyTextLimit),
      monthlyText: cap(env.AI_MONTHLY_TEXT_LIMIT, s?.monthlyTextLimit),
      dailyImage: cap(env.AI_DAILY_IMAGE_LIMIT, s?.dailyImageLimit),
      monthlyImage: cap(env.AI_MONTHLY_IMAGE_LIMIT, s?.monthlyImageLimit),
    };
  }

  private count(orgId: string, kind: AiKind, since: Date) {
    return this.prisma.aiUsage.count({
      where: { organizationId: orgId, kind, status: AiStatus.SUCCESS, createdAt: { gte: since } },
    });
  }

  async usage(orgId: string) {
    const day = startOfDayUtc();
    const month = startOfMonthUtc();
    const [textDay, textMonth, imageDay, imageMonth] = await Promise.all([
      this.count(orgId, AiKind.TEXT, day),
      this.count(orgId, AiKind.TEXT, month),
      this.count(orgId, AiKind.IMAGE, day),
      this.count(orgId, AiKind.IMAGE, month),
    ]);
    return {
      text: { today: textDay, month: textMonth },
      image: { today: imageDay, month: imageMonth },
    };
  }

  /** Throws 429 with a machine-readable body when a limit is hit. Preserves nothing: callers keep the request. */
  async assertAllowed(orgId: string, kind: AiKind) {
    this.checkRate(orgId);
    const [limits, usage] = await Promise.all([this.effectiveLimits(orgId), this.usage(orgId)]);
    const isText = kind === AiKind.TEXT;
    const checks = [
      {
        period: 'daily',
        limit: isText ? limits.dailyText : limits.dailyImage,
        used: isText ? usage.text.today : usage.image.today,
        resetsAt: startOfNextDayUtc(),
      },
      {
        period: 'monthly',
        limit: isText ? limits.monthlyText : limits.monthlyImage,
        used: isText ? usage.text.month : usage.image.month,
        resetsAt: startOfNextMonthUtc(),
      },
    ];
    for (const c of checks) {
      if (c.used >= c.limit) {
        throw new HttpException(
          {
            code: 'QUOTA_EXHAUSTED',
            message: `The ${c.period} ${isText ? 'text' : 'image'} generation limit for this organization has been reached.`,
            kind,
            period: c.period,
            limit: c.limit,
            used: c.used,
            resetsAt: c.resetsAt.toISOString(),
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
  }

  /** Sliding one-minute window per organization (in-memory; per API instance). */
  checkRate(orgId: string, now = Date.now()) {
    const max = loadEnv().AI_RATE_PER_MINUTE;
    const recent = (this.hits.get(orgId) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= max) {
      const retryAfter = Math.ceil((60_000 - (now - recent[0])) / 1000);
      throw new HttpException(
        {
          code: 'RATE_LIMITED',
          message: 'Too many AI requests. Please wait a moment.',
          retryAfterSeconds: retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    recent.push(now);
    this.hits.set(orgId, recent);
  }

  record(entry: {
    orgId: string;
    userId: string;
    provider: string;
    model: string;
    kind: AiKind;
    status: AiStatus;
    errorKind?: string;
    promptTokens?: number;
    completionTokens?: number;
    latencyMs: number;
  }) {
    return this.prisma.aiUsage.create({
      data: {
        organizationId: entry.orgId,
        userId: entry.userId,
        provider: entry.provider,
        model: entry.model,
        kind: entry.kind,
        status: entry.status,
        errorKind: entry.errorKind ?? null,
        promptTokens: entry.promptTokens ?? 0,
        completionTokens: entry.completionTokens ?? 0,
        latencyMs: entry.latencyMs,
      },
    });
  }
}
