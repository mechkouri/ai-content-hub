import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { parseBody } from '../common/parse';
import { OrgAccessGuard, RequirePermission } from '../organizations/org-access.guard';
import { BrandKitService, brandKitSchema } from './brand-kit.service';
import { MAX_UPLOAD_BYTES, MediaService } from './media.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidParam = (id: string) => {
  if (!UUID.test(id)) throw new NotFoundException('Not found');
  return id;
};

@Controller('organizations/:orgId')
@UseGuards(AuthGuard, OrgAccessGuard)
export class BrandController {
  constructor(
    private readonly kits: BrandKitService,
    private readonly media: MediaService,
  ) {}

  @Get('brand-kits')
  @RequirePermission('brand:read')
  listKits(@Param('orgId') orgId: string) {
    return this.kits.list(orgId);
  }

  @Get('brand-kits/active')
  @RequirePermission('brand:read')
  activeKit(@Param('orgId') orgId: string) {
    return this.kits.getActive(orgId);
  }

  @Post('brand-kits')
  @RequirePermission('brand:write')
  createKit(
    @Param('orgId') orgId: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    return this.kits.createVersion(orgId, req.user.id, parseBody(brandKitSchema, body));
  }

  @Post('brand-kits/:id/activate')
  @RequirePermission('brand:write')
  activate(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.kits.activate(orgId, uuidParam(id));
  }

  @Post('media')
  @RequirePermission('media:write')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  upload(
    @Param('orgId') orgId: string,
    @Req() req: AuthenticatedRequest,
    @UploadedFile() file?: { buffer: Buffer; originalname: string },
  ) {
    return this.media.upload(orgId, req.user.id, file);
  }

  @Get('media')
  @RequirePermission('media:read')
  listMedia(@Param('orgId') orgId: string) {
    return this.media.list(orgId);
  }

  @Get('media/:id/content')
  @RequirePermission('media:read')
  async content(@Param('orgId') orgId: string, @Param('id') id: string, @Res() res: Response) {
    const { asset, data } = await this.media.content(orgId, uuidParam(id));
    res.set({
      'Content-Type': asset.mimeType,
      'Content-Length': String(data.length),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=300',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    });
    res.send(data);
  }

  @Delete('media/:id')
  @RequirePermission('media:delete')
  remove(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.media.remove(orgId, uuidParam(id));
  }
}
