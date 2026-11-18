import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { parseBody } from '../common/parse';
import { OrgAccessGuard, RequirePermission } from '../organizations/org-access.guard';
import { StockImagesService } from './stock-images.service';

const searchSchema = z.object({
  q: z.string().trim().min(2).max(100),
  provider: z.enum(['openverse', 'pexels']).default('openverse'),
  page: z.coerce.number().int().min(1).max(50).default(1),
});
const importSchema = z.object({
  imageUrl: z.string().trim().url().max(2000),
  title: z.string().trim().max(200).default(''),
});

@Controller('organizations/:orgId/stock-images')
@UseGuards(AuthGuard, OrgAccessGuard)
export class StockImagesController {
  constructor(private readonly stock: StockImagesService) {}

  @Get('providers')
  @RequirePermission('media:write')
  providers() {
    return this.stock.providers();
  }

  @Get()
  @RequirePermission('media:write')
  search(@Query() query: unknown) {
    const q = parseBody(searchSchema, query);
    return this.stock.search(q.provider, q.q, q.page);
  }

  @Post('import')
  @RequirePermission('media:write')
  import(@Param('orgId') orgId: string, @Req() req: AuthenticatedRequest, @Body() body: unknown) {
    const b = parseBody(importSchema, body);
    return this.stock.import(orgId, req.user.id, b);
  }
}
