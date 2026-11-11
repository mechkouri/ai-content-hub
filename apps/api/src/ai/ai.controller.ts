import { Body, Controller, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { parseBody } from '../common/parse';
import { OrgAccessGuard, RequirePermission } from '../organizations/org-access.guard';
import { PrismaService } from '../prisma/prisma.service';
import { AiLimitsService } from './ai-limits.service';
import { AiService } from './ai.service';

const limit = z.number().int().min(0).max(1_000_000).nullable().optional();
const settingsSchema = z.object({
  textModel: z.string().trim().min(1).max(200).nullable().optional(),
  dailyTextLimit: limit,
  monthlyTextLimit: limit,
  dailyImageLimit: limit,
  monthlyImageLimit: limit,
});
const testText = z.object({ prompt: z.string().trim().min(1).max(2000) });
const testImage = z.object({
  prompt: z.string().trim().min(1).max(2048),
  steps: z.number().int().min(1).max(8).optional(),
});

@Controller('organizations/:orgId/ai')
@UseGuards(AuthGuard, OrgAccessGuard)
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly limits: AiLimitsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('status')
  @RequirePermission('ai:use')
  async status(@Param('orgId') orgId: string) {
    const [usage, limits, textModel, settings] = await Promise.all([
      this.limits.usage(orgId),
      this.limits.effectiveLimits(orgId),
      this.ai.effectiveTextModel(orgId),
      this.limits.getSettings(orgId),
    ]);
    return {
      providers: this.ai.providerStatus(),
      textModel,
      freeOnly: true,
      usage,
      limits,
      settings: settings
        ? {
            textModel: settings.textModel,
            dailyTextLimit: settings.dailyTextLimit,
            monthlyTextLimit: settings.monthlyTextLimit,
            dailyImageLimit: settings.dailyImageLimit,
            monthlyImageLimit: settings.monthlyImageLimit,
          }
        : null,
    };
  }

  @Get('models')
  @RequirePermission('ai:use')
  async models() {
    try {
      return { models: await this.ai.listFreeTextModels() };
    } catch (e) {
      throw this.ai.toHttp(e);
    }
  }

  @Put('settings')
  @RequirePermission('ai:admin')
  async updateSettings(@Param('orgId') orgId: string, @Body() body: unknown) {
    const dto = parseBody(settingsSchema, body);
    if (dto.textModel) await this.ai.assertFreeTextModel(dto.textModel);
    const data = Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined));
    return this.prisma.aiSetting.upsert({
      where: { organizationId: orgId },
      update: data,
      create: { organizationId: orgId, ...data },
    });
  }

  @Post('test-text')
  @RequirePermission('ai:admin')
  async testText(
    @Param('orgId') orgId: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    const { prompt } = parseBody(testText, body);
    const res = await this.ai.generateText(
      { orgId, userId: req.user.id },
      { prompt, maxTokens: 300 },
    );
    return { text: res.text, model: res.model, provider: res.provider, cached: res.cached };
  }

  @Post('test-image')
  @RequirePermission('ai:admin')
  async testImage(
    @Param('orgId') orgId: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    const dto = parseBody(testImage, body);
    const res = await this.ai.generateImage({ orgId, userId: req.user.id }, dto);
    return {
      provider: res.provider,
      model: res.model,
      mimeType: res.mimeType,
      imageBase64: res.data.toString('base64'),
    };
  }
}
