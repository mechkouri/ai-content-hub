import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { Membership, Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { canAssignRole } from '../auth/permissions';
import { PrismaService } from '../prisma/prisma.service';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

@Injectable()
export class InvitationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Returns the raw token once; only its hash is stored. Email delivery comes in a later feature. */
  async create(actor: Membership, email: string, role: Role) {
    if (!canAssignRole(actor.role, role))
      throw new ForbiddenException('You cannot invite this role');
    const token = randomBytes(32).toString('hex');
    const invitation = await this.prisma.invitation.create({
      data: {
        organizationId: actor.organizationId,
        email: email.toLowerCase(),
        role,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        invitedById: actor.userId,
      },
    });
    return {
      id: invitation.id,
      email: invitation.email,
      role,
      expiresAt: invitation.expiresAt,
      token,
    };
  }

  async accept(user: AuthUser, token: string) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!invitation || invitation.acceptedAt || invitation.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired invitation');
    }
    if (invitation.email !== user.email.toLowerCase()) {
      throw new ForbiddenException('This invitation was issued to a different email');
    }
    const [membership] = await this.prisma.$transaction([
      this.prisma.membership.upsert({
        where: {
          userId_organizationId: { userId: user.id, organizationId: invitation.organizationId },
        },
        update: {},
        create: {
          userId: user.id,
          organizationId: invitation.organizationId,
          role: invitation.role,
        },
      }),
      this.prisma.invitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      }),
    ]);
    return membership;
  }
}
