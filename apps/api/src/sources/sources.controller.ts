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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { parseBody } from '../common/parse';
import { OrgAccessGuard, RequirePermission } from '../organizations/org-access.guard';
import { MAX_FILE_BYTES } from './extract-text';
import { FACT_KINDS } from './fact-extraction';
import { SourcesService } from './sources.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (id: string) => {
  if (!UUID.test(id)) throw new NotFoundException('Not found');
  return id;
};

const textSchema = z.object({
  text: z.string().min(20).max(200_000),
  title: z.string().trim().max(150).optional(),
});
const urlSchema = z.object({ url: z.string().trim().url().max(2000) });
const kind = z.enum(FACT_KINDS);
const factUpdate = z
  .object({
    value: z.string().trim().min(1).max(500).optional(),
    kind: kind.optional(),
    quote: z.string().trim().max(600).nullable().optional(),
    verified: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
const factCreate = z.object({ kind, value: z.string().trim().min(1).max(500) });

@Controller('organizations/:orgId/sources')
@UseGuards(AuthGuard, OrgAccessGuard)
export class SourcesController {
  constructor(private readonly sources: SourcesService) {}

  @Get()
  @RequirePermission('source:read')
  list(@Param('orgId') orgId: string) {
    return this.sources.list(orgId);
  }

  @Get(':id')
  @RequirePermission('source:read')
  detail(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.sources.detail(orgId, uuid(id));
  }

  @Post('text')
  @RequirePermission('source:write')
  fromText(@Param('orgId') orgId: string, @Req() req: AuthenticatedRequest, @Body() body: unknown) {
    return this.sources.createFromText(orgId, req.user.id, parseBody(textSchema, body));
  }

  @Post('url')
  @RequirePermission('source:write')
  fromUrl(@Param('orgId') orgId: string, @Req() req: AuthenticatedRequest, @Body() body: unknown) {
    return this.sources.createFromUrl(orgId, req.user.id, parseBody(urlSchema, body).url);
  }

  @Post('file')
  @RequirePermission('source:write')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES, files: 1 } }))
  fromFile(
    @Param('orgId') orgId: string,
    @Req() req: AuthenticatedRequest,
    @UploadedFile() file?: { buffer: Buffer; originalname: string },
  ) {
    return this.sources.createFromFile(orgId, req.user.id, file);
  }

  @Post(':id/extract')
  @RequirePermission('source:write')
  extract(
    @Param('orgId') orgId: string,
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.sources.extract(orgId, req.user.id, uuid(id));
  }

  @Delete(':id')
  @RequirePermission('source:write')
  remove(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.sources.remove(orgId, uuid(id));
  }

  @Post(':id/facts')
  @RequirePermission('source:write')
  addFact(@Param('orgId') orgId: string, @Param('id') id: string, @Body() body: unknown) {
    return this.sources.addFact(orgId, uuid(id), parseBody(factCreate, body));
  }

  @Patch(':id/facts/:factId')
  @RequirePermission('source:write')
  updateFact(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Param('factId') factId: string,
    @Body() body: unknown,
  ) {
    return this.sources.updateFact(orgId, uuid(id), uuid(factId), parseBody(factUpdate, body));
  }

  @Delete(':id/facts/:factId')
  @RequirePermission('source:write')
  deleteFact(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Param('factId') factId: string,
  ) {
    return this.sources.deleteFact(orgId, uuid(id), uuid(factId));
  }
}
