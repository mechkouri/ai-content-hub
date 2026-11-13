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
import { DesignService } from './design.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (id: string) => {
  if (!UUID.test(id)) throw new NotFoundException('Not found');
  return id;
};

export const CATEGORIES = [
  'education',
  'recruitment',
  'event',
  'promotion',
  'news',
  'quote',
  'other',
] as const;

const COLOUR = /^(#[0-9a-fA-F]{6}|primary|secondary|accent|white|dark)$/;
const colour = z.string().regex(COLOUR);
const num = (min: number, max: number) => z.number().finite().min(min).max(max);

const base = {
  id: z.string().regex(/^[A-Za-z0-9_-]{1,24}$/),
  x: num(-20000, 20000),
  y: num(-20000, 20000),
  w: num(1, 20000),
  h: num(1, 20000),
  rotation: num(-360, 360),
  opacity: num(0, 1),
  locked: z.boolean().optional(),
};

const textEl = z
  .object({
    ...base,
    type: z.literal('text'),
    text: z.string().max(600),
    font: z.enum(['heading', 'body', 'Inter', 'Plus Jakarta Sans', 'Geist', 'Cairo', 'Tajawal']),
    size: num(4, 1000),
    bold: z.boolean(),
    italic: z.boolean(),
    uppercase: z.boolean(),
    color: colour,
    align: z.enum(['left', 'center', 'right']),
    lineHeight: num(0.5, 4),
    letterSpacing: num(-20, 100),
    box: colour.nullable(),
    boxRadius: num(0, 5000),
    padding: num(0, 1000),
  })
  .strict();
const shapeEl = z
  .object({
    ...base,
    type: z.literal('shape'),
    shape: z.enum(['rect', 'ellipse', 'gradient']),
    fill: colour,
    radius: num(0, 5000),
    stroke: colour.nullable(),
    strokeWidth: num(0, 500),
  })
  .strict();
const imageEl = z
  .object({
    ...base,
    type: z.literal('image'),
    assetId: z.string().uuid(),
    fit: z.enum(['cover', 'contain']),
    radius: num(0, 5000),
  })
  .strict();
const logoEl = z.object({ ...base, type: z.literal('logo') }).strict();

/** What a template remembers: the whole page. Colours may be brand tokens, so a template survives a rebrand. */
export const specSchema = z
  .object({
    format: z.enum(['square', 'portrait', 'landscape', 'story']),
    background: colour,
    elements: z.array(z.discriminatedUnion('type', [textEl, shapeEl, imageEl, logoEl])).max(80),
  })
  .strict();

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  category: z.enum(CATEGORIES),
  spec: specSchema,
});
const updateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  category: z.enum(CATEGORIES).optional(),
  spec: specSchema.optional(),
});

@Controller('organizations/:orgId/design-templates')
@UseGuards(AuthGuard, OrgAccessGuard)
export class DesignController {
  constructor(private readonly design: DesignService) {}

  @Get()
  @RequirePermission('design:read')
  list(@Param('orgId') orgId: string) {
    return this.design.list(orgId);
  }

  @Post()
  @RequirePermission('design:write')
  create(@Param('orgId') orgId: string, @Req() req: AuthenticatedRequest, @Body() body: unknown) {
    return this.design.create(orgId, req.user.id, parseBody(createSchema, body));
  }

  @Patch(':id')
  @RequirePermission('design:write')
  update(@Param('orgId') orgId: string, @Param('id') id: string, @Body() body: unknown) {
    return this.design.update(orgId, uuid(id), parseBody(updateSchema, body));
  }

  @Delete(':id')
  @RequirePermission('design:write')
  remove(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.design.remove(orgId, uuid(id));
  }
}
