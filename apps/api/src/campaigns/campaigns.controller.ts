import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { parseBody } from '../common/parse';
import { OrgAccessGuard, RequirePermission } from '../organizations/org-access.guard';
import { CampaignsService } from './campaigns.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (id: string) => {
  if (!UUID.test(id)) throw new NotFoundException('Not found');
  return id;
};

// Dates travel as plain "YYYY-MM-DD" so time zones can never shift a campaign by a day.
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')
  // Reject days that do not exist (2027-02-31 would otherwise roll over to March).
  .refine((s) => {
    const d = new Date(s + 'T00:00:00.000Z');
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'Not a valid date')
  .transform((s) => new Date(s + 'T00:00:00.000Z'))
  .refine((d) => !Number.isNaN(d.getTime()), 'Not a valid date');

const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).nullish(),
  startsOn: day.nullish(),
  endsOn: day.nullish(),
});
const updateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  startsOn: day.nullable().optional(),
  endsOn: day.nullable().optional(),
  status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
});
const listSchema = z.object({ status: z.enum(['ACTIVE', 'ARCHIVED']).optional() });
const addSchema = z.object({ contentIds: z.array(z.string().uuid()).min(1).max(50) });

@Controller('organizations/:orgId/campaigns')
@UseGuards(AuthGuard, OrgAccessGuard)
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Get()
  @RequirePermission('campaign:read')
  list(@Param('orgId') orgId: string, @Query() query: unknown) {
    return this.campaigns.list(orgId, parseBody(listSchema, query).status);
  }

  @Post()
  @RequirePermission('campaign:write')
  create(@Param('orgId') orgId: string, @Req() req: AuthenticatedRequest, @Body() body: unknown) {
    return this.campaigns.create(orgId, req.user.id, parseBody(createSchema, body));
  }

  @Get(':id')
  @RequirePermission('campaign:read')
  detail(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.campaigns.detail(orgId, uuid(id));
  }

  @Patch(':id')
  @RequirePermission('campaign:write')
  update(@Param('orgId') orgId: string, @Param('id') id: string, @Body() body: unknown) {
    return this.campaigns.update(orgId, uuid(id), parseBody(updateSchema, body));
  }

  @Delete(':id')
  @RequirePermission('campaign:write')
  remove(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.campaigns.remove(orgId, uuid(id));
  }

  @Post(':id/content')
  @RequirePermission('campaign:write')
  add(@Param('orgId') orgId: string, @Param('id') id: string, @Body() body: unknown) {
    return this.campaigns.addContent(orgId, uuid(id), parseBody(addSchema, body).contentIds);
  }

  @Delete(':id/content/:contentId')
  @RequirePermission('campaign:write')
  removeContent(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Param('contentId') contentId: string,
  ) {
    return this.campaigns.removeContent(orgId, uuid(id), uuid(contentId));
  }
}
