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
import { ApprovalsService } from './approvals.service';
import { KINDS, LANGUAGES, optionsSchema } from './content-schemas';
import { ImagesService } from './images.service';
import { SEO_FIELDS } from './seo-assist';
import { ScheduleService } from './schedule.service';
import { StudioService } from './studio.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (id: string) => {
  if (!UUID.test(id)) throw new NotFoundException('Not found');
  return id;
};

const generateSchema = z.object({
  sourceId: z.string().uuid(),
  kind: z.enum(KINDS),
  options: optionsSchema.default({}),
});
const seoSuggestInput = z.object({
  field: z.enum(SEO_FIELDS),
  keyword: z.string().trim().max(80).nullable().optional(),
  content: z.record(z.unknown()).optional(),
});
const translateSchema = z.object({ language: z.enum(LANGUAGES) });
// The focus keyword belongs to an article's SEO and can be changed with the text.
const updateSchema = z.object({
  content: z.record(z.unknown()),
  primaryKeyword: z.string().trim().max(80).nullable().optional(),
});
const commentSchema = z.object({ comment: z.string().trim().max(1000).optional() });
const changesSchema = z.object({ comment: z.string().trim().min(3).max(1000) });
const listSchema = z.object({
  sourceId: z.string().uuid().optional(),
  approvalStatus: z.enum(['DRAFT', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED']).optional(),
  kind: z.enum(KINDS).optional(),
  campaignId: z.string().uuid().optional(),
  scheduledFrom: z.coerce.date().optional(),
  scheduledTo: z.coerce.date().optional(),
});
const altSchema = z.object({ altText: z.string().max(500) });
const attachSchema = z.object({ assetId: z.string().uuid() });
const drawSchema = z.object({ prompt: z.string().trim().min(3).max(500).optional() });
const scheduleSchema = z.object({ scheduledFor: z.coerce.date() });

@Controller('organizations/:orgId/content')
@UseGuards(AuthGuard, OrgAccessGuard)
export class StudioController {
  constructor(
    private readonly studio: StudioService,
    private readonly approvals: ApprovalsService,
    private readonly schedule: ScheduleService,
    private readonly images: ImagesService,
  ) {}

  @Post('generate')
  @RequirePermission('content:write')
  generate(@Param('orgId') orgId: string, @Req() req: AuthenticatedRequest, @Body() body: unknown) {
    return this.studio.generate(orgId, req.user.id, parseBody(generateSchema, body));
  }

  @Get()
  @RequirePermission('content:read')
  list(@Param('orgId') orgId: string, @Query() query: unknown) {
    return this.studio.list(orgId, parseBody(listSchema, query));
  }

  @Get(':id')
  @RequirePermission('content:read')
  detail(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.studio.detail(orgId, uuid(id));
  }

  @Post(':id/translate')
  @RequirePermission('content:write')
  translate(
    @Param('orgId') orgId: string,
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.studio.translate(
      orgId,
      req.user.id,
      uuid(id),
      parseBody(translateSchema, body).language,
    );
  }

  /** Dry run of an edit: returns the claim warnings (and, for articles, the SEO checks) without saving. */
  @Post(':id/check')
  @RequirePermission('content:read')
  check(@Param('orgId') orgId: string, @Param('id') id: string, @Body() body: unknown) {
    const b = parseBody(updateSchema, body);
    return this.studio.check(orgId, uuid(id), b.content, b.primaryKeyword);
  }

  @Patch(':id')
  @RequirePermission('content:write')
  update(
    @Param('orgId') orgId: string,
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const b = parseBody(updateSchema, body);
    return this.studio.update(orgId, uuid(id), b.content, req.user.id, b.primaryKeyword);
  }

  /** AI ideas for an article's SEO title, meta description or focus keyword. Nothing is saved. */
  @Post(':id/seo-suggest')
  @RequirePermission('content:write')
  seoSuggest(
    @Param('orgId') orgId: string,
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.studio.seoSuggest(orgId, req.user.id, uuid(id), parseBody(seoSuggestInput, body));
  }

  @Get(':id/reviews')
  @RequirePermission('content:read')
  reviews(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.approvals.history(orgId, uuid(id));
  }

  @Get(':id/images')
  @RequirePermission('content:read')
  listImages(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.images.list(orgId, uuid(id));
  }

  @Post(':id/images')
  @RequirePermission('content:write')
  attachImage(
    @Param('orgId') orgId: string,
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.images.attach(orgId, uuid(id), parseBody(attachSchema, body).assetId, req.user.id);
  }

  @Post(':id/images/generate')
  @RequirePermission('ai:use')
  generateImage(
    @Param('orgId') orgId: string,
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.images.generate(
      orgId,
      uuid(id),
      req.user.id,
      parseBody(drawSchema, body ?? {}).prompt,
    );
  }

  @Patch(':id/images/:assetId')
  @RequirePermission('content:write')
  describeImage(
    @Param('orgId') orgId: string,
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('assetId') assetId: string,
    @Body() body: unknown,
  ) {
    return this.images.setAltText(
      orgId,
      uuid(id),
      uuid(assetId),
      req.user.id,
      parseBody(altSchema, body).altText,
    );
  }

  @Delete(':id/images/:assetId')
  @RequirePermission('content:write')
  removeImage(
    @Param('orgId') orgId: string,
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('assetId') assetId: string,
  ) {
    return this.images.remove(orgId, uuid(id), uuid(assetId), req.user.id);
  }

  @Post(':id/schedule')
  @RequirePermission('content:schedule')
  scheduleContent(
    @Param('orgId') orgId: string,
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const { scheduledFor } = parseBody(scheduleSchema, body);
    return this.schedule.schedule(orgId, uuid(id), req.user.id, scheduledFor);
  }

  @Post(':id/unschedule')
  @RequirePermission('content:schedule')
  unschedule(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.schedule.unschedule(orgId, uuid(id));
  }

  @Post(':id/submit')
  @RequirePermission('content:write')
  submit(
    @Param('orgId') orgId: string,
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const { comment } = parseBody(commentSchema, body ?? {});
    return this.approvals.submit(orgId, uuid(id), req.user.id, comment);
  }

  @Post(':id/withdraw')
  @RequirePermission('content:write')
  withdraw(
    @Param('orgId') orgId: string,
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const { comment } = parseBody(commentSchema, body ?? {});
    return this.approvals.withdraw(orgId, uuid(id), req.user.id, req.membership!.role, comment);
  }

  @Post(':id/approve')
  @RequirePermission('content:review')
  approve(
    @Param('orgId') orgId: string,
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const { comment } = parseBody(commentSchema, body ?? {});
    return this.approvals.approve(orgId, uuid(id), req.user.id, comment);
  }

  @Post(':id/request-changes')
  @RequirePermission('content:review')
  requestChanges(
    @Param('orgId') orgId: string,
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const { comment } = parseBody(changesSchema, body);
    return this.approvals.requestChanges(orgId, uuid(id), req.user.id, comment);
  }

  @Delete(':id')
  @RequirePermission('content:write')
  remove(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.studio.remove(orgId, uuid(id));
  }
}
