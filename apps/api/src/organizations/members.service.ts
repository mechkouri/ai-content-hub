import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Membership, Role } from '@prisma/client';
import { canAssignRole, canModifyMember } from '../auth/permissions';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MembersService {
  constructor(private readonly prisma: PrismaService) {}

  list(orgId: string) {
    return this.prisma.membership.findMany({
      where: { organizationId: orgId },
      include: { user: { select: { id: true, email: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async findTarget(orgId: string, userId: string) {
    const target = await this.prisma.membership.findUnique({
      where: { userId_organizationId: { userId, organizationId: orgId } },
    });
    if (!target) throw new NotFoundException('Member not found');
    return target;
  }

  private async assertNotLastOwner(orgId: string, target: Membership) {
    if (target.role !== Role.OWNER) return;
    const owners = await this.prisma.membership.count({
      where: { organizationId: orgId, role: Role.OWNER },
    });
    if (owners <= 1) throw new ForbiddenException('An organization must keep at least one owner');
  }

  async changeRole(actor: Membership, userId: string, role: Role) {
    const target = await this.findTarget(actor.organizationId, userId);
    if (!canModifyMember(actor.role, target.role) || !canAssignRole(actor.role, role)) {
      throw new ForbiddenException('You cannot assign this role');
    }
    if (role !== Role.OWNER) await this.assertNotLastOwner(actor.organizationId, target);
    return this.prisma.membership.update({ where: { id: target.id }, data: { role } });
  }

  async remove(actor: Membership, userId: string) {
    const target = await this.findTarget(actor.organizationId, userId);
    if (!canModifyMember(actor.role, target.role)) {
      throw new ForbiddenException('You cannot remove this member');
    }
    await this.assertNotLastOwner(actor.organizationId, target);
    await this.prisma.membership.delete({ where: { id: target.id } });
    return { removed: true };
  }
}
