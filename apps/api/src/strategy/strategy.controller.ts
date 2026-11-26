import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { parseBody } from '../common/parse';
import { OrgAccessGuard, RequirePermission } from '../organizations/org-access.guard';
import { LANGUAGES } from '../studio/content-schemas';
import { StrategyService } from './strategy.service';

const website = z.string().trim().url().max(2000);
const planInput = z.object({
  business: z.string().trim().min(10).max(600),
  location: z.string().trim().max(100).optional(),
  audience: z.string().trim().max(150).optional(),
  website: website.optional(),
  language: z.enum(LANGUAGES),
});
const auditInput = z.object({ website });
const snippetInput = z.object({ website, language: z.enum(LANGUAGES) });

@Controller('organizations/:orgId/seo')
@UseGuards(AuthGuard, OrgAccessGuard)
export class StrategyController {
  constructor(private readonly strategy: StrategyService) {}

  /** Keyword groups and a blog plan. Uses one AI generation. */
  @Post('plan')
  @RequirePermission('content:write')
  plan(@Param('orgId') orgId: string, @Req() req: AuthenticatedRequest, @Body() body: unknown) {
    return this.strategy.plan(orgId, req.user.id, parseBody(planInput, body));
  }

  /** Website check only. Uses no AI generation. */
  @Post('audit')
  @RequirePermission('content:write')
  audit(@Body() body: unknown) {
    return this.strategy.audit(parseBody(auditInput, body).website);
  }

  /** A better title and description for one page. Uses one AI generation. */
  @Post('page-snippet')
  @RequirePermission('content:write')
  snippet(@Param('orgId') orgId: string, @Req() req: AuthenticatedRequest, @Body() body: unknown) {
    const { website: url, language } = parseBody(snippetInput, body);
    return this.strategy.suggestSnippet(orgId, req.user.id, url, language);
  }

  /** Checks up to ten pages of the website. Uses no AI generation. */
  @Post('audit-site')
  @RequirePermission('content:write')
  auditSite(@Body() body: unknown) {
    return this.strategy.auditSite(parseBody(auditInput, body).website);
  }
}
