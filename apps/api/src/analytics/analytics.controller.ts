import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard';
import { parseBody } from '../common/parse';
import { OrgAccessGuard, RequirePermission } from '../organizations/org-access.guard';
import { AnalyticsService, RANGES } from './analytics.service';

const querySchema = z.object({
  days: z.coerce
    .number()
    .int()
    .refine((n) => (RANGES as readonly number[]).includes(n), 'Choose 7, 30 or 90 days')
    .default(30),
});

@Controller('organizations/:orgId/analytics')
@UseGuards(AuthGuard, OrgAccessGuard)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get()
  @RequirePermission('analytics:read')
  overview(@Param('orgId') orgId: string, @Query() query: unknown) {
    return this.analytics.overview(orgId, parseBody(querySchema, query).days);
  }
}
