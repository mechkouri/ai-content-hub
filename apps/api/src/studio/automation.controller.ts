import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { parseBody } from '../common/parse';
import { OrgAccessGuard, RequirePermission } from '../organizations/org-access.guard';
import { isTimeZone } from './automation-timing';
import { AutomationService } from './automation.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (id: string) => {
  if (!UUID.test(id)) throw new NotFoundException('Not found');
  return id;
};

const fields = {
  name: z.string().trim().min(2).max(80),
  enabled: z.boolean(),
  kinds: z
    .array(z.enum(['ARTICLE', 'INSTAGRAM', 'FACEBOOK', 'LINKEDIN']))
    .max(4)
    .transform((k) => [...new Set(k)]),
  mode: z.enum(['now', 'slot']),
  slot: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use the format HH:MM')
    .nullable(),
  timezone: z.string().max(64).refine(isTimeZone, 'Unknown time zone'),
  channelIds: z
    .array(z.string().uuid())
    .min(1)
    .max(10)
    .transform((c) => [...new Set(c)]),
};

const createSchema = z
  .object({ ...fields, enabled: fields.enabled.default(true), slot: fields.slot.default(null) })
  .refine((v) => v.mode === 'now' || v.slot, {
    message: 'Choose the daily time',
    path: ['slot'],
  });
const updateSchema = z.object(fields).partial();

@Controller('organizations/:orgId/automation-rules')
@UseGuards(AuthGuard, OrgAccessGuard)
export class AutomationController {
  constructor(private readonly automation: AutomationService) {}

  @Get()
  @RequirePermission('automation:read')
  list(@Param('orgId') orgId: string) {
    return this.automation.list(orgId);
  }

  @Post()
  @RequirePermission('automation:write')
  create(@Param('orgId') orgId: string, @Req() req: AuthenticatedRequest, @Body() body: unknown) {
    return this.automation.create(orgId, req.user.id, parseBody(createSchema, body));
  }

  @Patch(':id')
  @RequirePermission('automation:write')
  update(@Param('orgId') orgId: string, @Param('id') id: string, @Body() body: unknown) {
    return this.automation.update(orgId, uuid(id), parseBody(updateSchema, body));
  }

  @Delete(':id')
  @RequirePermission('automation:write')
  remove(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.automation.remove(orgId, uuid(id));
  }
}
