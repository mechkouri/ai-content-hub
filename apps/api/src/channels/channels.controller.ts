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
import { ChannelsService } from './channels.service';
import { PublishingService } from './publishing.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (id: string) => {
  if (!UUID.test(id)) throw new NotFoundException('Not found');
  return id;
};

const createSchema = z
  .object({
    provider: z.enum(['TEST', 'WORDPRESS', 'FACEBOOK', 'INSTAGRAM', 'LINKEDIN']),
    name: z.string().trim().min(2).max(80),
    autoPublish: z.boolean().optional(),
  })
  // Provider-specific details (site address, login...) are checked by the provider itself.
  .passthrough();
const updateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  status: z.enum(['CONNECTED', 'DISCONNECTED']).optional(),
  autoPublish: z.boolean().optional(),
});
const queueSchema = z.object({
  contentId: z.string().uuid(),
  channelIds: z.array(z.string().uuid()).min(1).max(10),
  when: z.enum(['now', 'scheduled']),
});
const jobsSchema = z.object({
  contentId: z.string().uuid().optional(),
  status: z.enum(['QUEUED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'CANCELLED']).optional(),
});

@Controller('organizations/:orgId')
@UseGuards(AuthGuard, OrgAccessGuard)
export class ChannelsController {
  constructor(
    private readonly channels: ChannelsService,
    private readonly publishing: PublishingService,
  ) {}

  @Get('channels/providers')
  @RequirePermission('channel:read')
  providers() {
    return this.channels.available();
  }

  @Get('channels')
  @RequirePermission('channel:read')
  list(@Param('orgId') orgId: string) {
    return this.channels.list(orgId);
  }

  @Post('channels')
  @RequirePermission('channel:write')
  create(@Param('orgId') orgId: string, @Req() req: AuthenticatedRequest, @Body() body: unknown) {
    return this.channels.create(orgId, req.user.id, parseBody(createSchema, body));
  }

  @Patch('channels/:id')
  @RequirePermission('channel:write')
  update(@Param('orgId') orgId: string, @Param('id') id: string, @Body() body: unknown) {
    return this.channels.update(orgId, uuid(id), parseBody(updateSchema, body));
  }

  @Delete('channels/:id')
  @RequirePermission('channel:write')
  remove(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.channels.remove(orgId, uuid(id));
  }

  @Post('publishing/jobs')
  @RequirePermission('content:schedule')
  queue(@Param('orgId') orgId: string, @Req() req: AuthenticatedRequest, @Body() body: unknown) {
    return this.publishing.queue(orgId, req.user.id, parseBody(queueSchema, body));
  }

  @Get('publishing/jobs')
  @RequirePermission('content:read')
  jobs(@Param('orgId') orgId: string, @Query() query: unknown) {
    return this.publishing.list(orgId, parseBody(jobsSchema, query));
  }

  @Post('publishing/jobs/:id/cancel')
  @RequirePermission('content:schedule')
  cancel(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.publishing.cancel(orgId, uuid(id));
  }

  @Post('publishing/jobs/:id/retry')
  @RequirePermission('content:schedule')
  retry(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.publishing.retry(orgId, uuid(id));
  }
}
