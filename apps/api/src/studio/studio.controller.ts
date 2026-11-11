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
import { KINDS, LANGUAGES, optionsSchema } from './content-schemas';
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
const translateSchema = z.object({ language: z.enum(LANGUAGES) });
const updateSchema = z.object({ content: z.record(z.unknown()) });
const listSchema = z.object({
  sourceId: z.string().uuid().optional(),
  kind: z.enum(KINDS).optional(),
});

@Controller('organizations/:orgId/content')
@UseGuards(AuthGuard, OrgAccessGuard)
export class StudioController {
  constructor(private readonly studio: StudioService) {}

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

  /** Dry run of an edit: returns the claim warnings without saving (used for live highlighting). */
  @Post(':id/check')
  @RequirePermission('content:read')
  check(@Param('orgId') orgId: string, @Param('id') id: string, @Body() body: unknown) {
    return this.studio.check(orgId, uuid(id), parseBody(updateSchema, body).content);
  }

  @Patch(':id')
  @RequirePermission('content:write')
  update(@Param('orgId') orgId: string, @Param('id') id: string, @Body() body: unknown) {
    return this.studio.update(orgId, uuid(id), parseBody(updateSchema, body).content);
  }

  @Delete(':id')
  @RequirePermission('content:write')
  remove(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.studio.remove(orgId, uuid(id));
  }
}
