import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApprovalStatus, ContentStatus, ReviewAction, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Human approval workflow: DRAFT -> IN_REVIEW -> APPROVED / CHANGES_REQUESTED.
 * Separate from the automatic claim check (ContentStatus): content with unresolved
 * claim warnings can never be submitted, and any later edit voids an approval.
 */
@Injectable()
export class ApprovalsService {
  constructor(private readonly prisma: PrismaService) {}

  private async find(orgId: string, id: string) {
    const piece = await this.prisma.contentPiece.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!piece) throw new NotFoundException('Content not found');
    return piece;
  }

  private async move(
    orgId: string,
    piece: { id: string },
    actorId: string,
    action: ReviewAction,
    to: ApprovalStatus,
    comment?: string,
    submittedById?: string | null,
  ) {
    const updated = await this.prisma.contentPiece.update({
      where: { id: piece.id },
      data: {
        approvalStatus: to,
        ...(submittedById !== undefined ? { submittedById } : {}),
      },
    });
    await this.prisma.contentReview.create({
      data: {
        organizationId: orgId,
        contentId: piece.id,
        action,
        actorId,
        comment: comment?.trim() || null,
      },
    });
    return updated;
  }

  async submit(orgId: string, id: string, actorId: string, comment?: string) {
    const piece = await this.find(orgId, id);
    if (
      piece.approvalStatus !== ApprovalStatus.DRAFT &&
      piece.approvalStatus !== ApprovalStatus.CHANGES_REQUESTED
    ) {
      throw new ConflictException(`Cannot submit content that is ${piece.approvalStatus}`);
    }
    if (piece.status === ContentStatus.NEEDS_REVIEW) {
      throw new ConflictException(
        'Resolve the unsupported claims flagged in this content before submitting it for approval',
      );
    }
    return this.move(
      orgId,
      piece,
      actorId,
      ReviewAction.SUBMITTED,
      ApprovalStatus.IN_REVIEW,
      comment,
      actorId,
    );
  }

  async withdraw(orgId: string, id: string, actorId: string, role: Role, comment?: string) {
    const piece = await this.find(orgId, id);
    if (piece.approvalStatus !== ApprovalStatus.IN_REVIEW) {
      throw new ConflictException('Only content in review can be withdrawn');
    }
    const manager = role === Role.OWNER || role === Role.ADMIN;
    if (piece.submittedById !== actorId && !manager) {
      throw new ForbiddenException('Only the person who submitted it can withdraw it');
    }
    return this.move(
      orgId,
      piece,
      actorId,
      ReviewAction.WITHDRAWN,
      ApprovalStatus.DRAFT,
      comment,
      null,
    );
  }

  private async decidable(orgId: string, id: string) {
    const piece = await this.find(orgId, id);
    if (piece.approvalStatus !== ApprovalStatus.IN_REVIEW) {
      throw new ConflictException('Only content in review can be approved or sent back');
    }
    return piece;
  }

  async approve(orgId: string, id: string, actorId: string, comment?: string) {
    const piece = await this.decidable(orgId, id);
    return this.move(
      orgId,
      piece,
      actorId,
      ReviewAction.APPROVED,
      ApprovalStatus.APPROVED,
      comment,
    );
  }

  async requestChanges(orgId: string, id: string, actorId: string, comment: string) {
    const piece = await this.decidable(orgId, id);
    return this.move(
      orgId,
      piece,
      actorId,
      ReviewAction.CHANGES_REQUESTED,
      ApprovalStatus.CHANGES_REQUESTED,
      comment,
    );
  }

  /** Called when content is edited: an approval or pending review no longer applies to the new text. */
  async invalidateAfterEdit(
    orgId: string,
    piece: { id: string; approvalStatus: ApprovalStatus },
    actorId: string,
  ) {
    if (
      piece.approvalStatus !== ApprovalStatus.IN_REVIEW &&
      piece.approvalStatus !== ApprovalStatus.APPROVED
    ) {
      return null;
    }
    return this.move(
      orgId,
      piece,
      actorId,
      ReviewAction.INVALIDATED,
      ApprovalStatus.DRAFT,
      'Content was edited after submission',
      null,
    );
  }

  async history(orgId: string, id: string) {
    const piece = await this.find(orgId, id);
    return this.prisma.contentReview.findMany({
      where: { organizationId: orgId, contentId: piece.id },
      orderBy: { createdAt: 'asc' },
    });
  }
}
