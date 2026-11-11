import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApprovalStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const MAX_AHEAD_MS = 366 * 24 * 60 * 60 * 1000;

/**
 * Content calendar: only approved content can be planned for a date. This stores the plan;
 * nothing is published yet. Editing the content later voids its approval and clears the date.
 */
@Injectable()
export class ScheduleService {
  constructor(private readonly prisma: PrismaService) {}

  private async find(orgId: string, id: string) {
    const piece = await this.prisma.contentPiece.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!piece) throw new NotFoundException('Content not found');
    return piece;
  }

  async schedule(orgId: string, id: string, actorId: string, when: Date, now = new Date()) {
    const piece = await this.find(orgId, id);
    if (piece.approvalStatus !== ApprovalStatus.APPROVED) {
      throw new ConflictException('Only approved content can be scheduled');
    }
    if (when.getTime() <= now.getTime()) {
      throw new BadRequestException('Choose a date and time in the future');
    }
    if (when.getTime() - now.getTime() > MAX_AHEAD_MS) {
      throw new BadRequestException('Schedule at most one year ahead');
    }
    return this.prisma.contentPiece.update({
      where: { id: piece.id },
      data: { scheduledFor: when, scheduledById: actorId },
    });
  }

  async unschedule(orgId: string, id: string) {
    const piece = await this.find(orgId, id);
    if (!piece.scheduledFor) throw new ConflictException('This content is not scheduled');
    return this.prisma.contentPiece.update({
      where: { id: piece.id },
      data: { scheduledFor: null, scheduledById: null },
    });
  }
}
