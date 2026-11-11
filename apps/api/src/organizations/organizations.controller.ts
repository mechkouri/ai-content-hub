import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { parseBody } from '../common/parse';
import { InvitationsService } from './invitations.service';
import { MembersService } from './members.service';
import { OrgAccessGuard, RequirePermission } from './org-access.guard';
import { OrganizationsService } from './organizations.service';

const lang = z.enum(['fr', 'ar', 'en']);
const createOrg = z.object({
  name: z.string().trim().min(2).max(100),
  defaultLanguage: lang.optional(),
});
const updateOrg = z
  .object({ name: z.string().trim().min(2).max(100).optional(), defaultLanguage: lang.optional() })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
const roleEnum = z.nativeEnum(Role);
const inviteSchema = z.object({ email: z.string().email().max(254), role: roleEnum });
const changeRole = z.object({ role: roleEnum });
const acceptSchema = z.object({ token: z.string().min(16).max(256) });

@Controller()
@UseGuards(AuthGuard)
export class OrganizationsController {
  constructor(
    private readonly orgs: OrganizationsService,
    private readonly members: MembersService,
    private readonly invitations: InvitationsService,
  ) {}

  @Get('me')
  async me(@Req() req: AuthenticatedRequest) {
    const memberships = await this.orgs.listForUser(req.user.id);
    return { user: req.user, memberships };
  }

  @Post('organizations')
  create(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    const dto = parseBody(createOrg, body);
    return this.orgs.create(req.user.id, dto.name, dto.defaultLanguage);
  }

  @Get('organizations')
  list(@Req() req: AuthenticatedRequest) {
    return this.orgs.listForUser(req.user.id);
  }

  @Get('organizations/:orgId')
  @UseGuards(OrgAccessGuard)
  @RequirePermission('org:read')
  get(@Param('orgId') orgId: string) {
    return this.orgs.get(orgId);
  }

  @Patch('organizations/:orgId')
  @UseGuards(OrgAccessGuard)
  @RequirePermission('org:update')
  update(@Param('orgId') orgId: string, @Body() body: unknown) {
    return this.orgs.update(orgId, parseBody(updateOrg, body));
  }

  @Get('organizations/:orgId/members')
  @UseGuards(OrgAccessGuard)
  @RequirePermission('members:read')
  listMembers(@Param('orgId') orgId: string) {
    return this.members.list(orgId);
  }

  @Patch('organizations/:orgId/members/:userId')
  @UseGuards(OrgAccessGuard)
  @RequirePermission('members:update')
  changeMemberRole(
    @Req() req: AuthenticatedRequest,
    @Param('userId') userId: string,
    @Body() body: unknown,
  ) {
    return this.members.changeRole(req.membership!, userId, parseBody(changeRole, body).role);
  }

  @Delete('organizations/:orgId/members/:userId')
  @UseGuards(OrgAccessGuard)
  @RequirePermission('members:remove')
  removeMember(@Req() req: AuthenticatedRequest, @Param('userId') userId: string) {
    return this.members.remove(req.membership!, userId);
  }

  @Post('organizations/:orgId/invitations')
  @UseGuards(OrgAccessGuard)
  @RequirePermission('members:invite')
  invite(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    const dto = parseBody(inviteSchema, body);
    return this.invitations.create(req.membership!, dto.email, dto.role);
  }

  @Post('invitations/accept')
  accept(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    return this.invitations.accept(req.user, parseBody(acceptSchema, body).token);
  }
}
