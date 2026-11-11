import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedRequest } from '../auth/auth.types';
import { hasPermission, Permission } from '../auth/permissions';
import { PrismaService } from '../prisma/prisma.service';

const PERMISSION_KEY = 'required_permission';
export const RequirePermission = (permission: Permission) =>
  SetMetadata(PERMISSION_KEY, permission);

/**
 * Tenant isolation: the organization comes from the URL, but access is only granted if the
 * authenticated user has a membership in it. Non-members get 404 (no org enumeration).
 */
@Injectable()
export class OrgAccessGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const orgId = String(req.params.orgId ?? '');
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!orgId || !uuid.test(orgId)) throw new NotFoundException('Organization not found');

    const membership = await this.prisma.membership.findUnique({
      where: { userId_organizationId: { userId: req.user.id, organizationId: orgId } },
    });
    if (!membership) throw new NotFoundException('Organization not found');

    const required = this.reflector.get<Permission | undefined>(
      PERMISSION_KEY,
      context.getHandler(),
    );
    if (required && !hasPermission(membership.role, required)) {
      throw new ForbiddenException('Insufficient permissions');
    }
    req.membership = membership;
    return true;
  }
}
