import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApprovalStatus, CampaignStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface CampaignInput {
  name?: string;
  description?: string | null;
  startsOn?: Date | null;
  endsOn?: Date | null;
  status?: CampaignStatus;
}

const PIECE_SELECT = {
  id: true,
  kind: true,
  title: true,
  language: true,
  status: true,
  approvalStatus: true,
  scheduledFor: true,
  createdAt: true,
} as const;

/** Progress of a campaign, counted from its content. */
function stats(pieces: { approvalStatus: ApprovalStatus; scheduledFor: Date | null }[]) {
  const by = (s: ApprovalStatus) => pieces.filter((p) => p.approvalStatus === s).length;
  return {
    total: pieces.length,
    draft: by(ApprovalStatus.DRAFT) + by(ApprovalStatus.CHANGES_REQUESTED),
    inReview: by(ApprovalStatus.IN_REVIEW),
    approved: by(ApprovalStatus.APPROVED),
    scheduled: pieces.filter((p) => p.scheduledFor).length,
  };
}

function checkDates(startsOn?: Date | null, endsOn?: Date | null) {
  if (startsOn && endsOn && endsOn.getTime() < startsOn.getTime()) {
    throw new BadRequestException('The end date cannot be before the start date');
  }
}

@Injectable()
export class CampaignsService {
  constructor(private readonly prisma: PrismaService) {}

  private async find(orgId: string, id: string) {
    const c = await this.prisma.campaign.findFirst({ where: { id, organizationId: orgId } });
    if (!c) throw new NotFoundException('Campaign not found');
    return c;
  }

  async list(orgId: string, status?: CampaignStatus) {
    const rows = await this.prisma.campaign.findMany({
      where: { organizationId: orgId, ...(status ? { status } : {}) },
      include: { pieces: { select: { approvalStatus: true, scheduledFor: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map(({ pieces, ...c }) => ({ ...c, stats: stats(pieces) }));
  }

  async create(orgId: string, actorId: string, input: CampaignInput) {
    checkDates(input.startsOn, input.endsOn);
    return this.prisma.campaign.create({
      data: {
        organizationId: orgId,
        createdById: actorId,
        name: input.name!,
        description: input.description ?? null,
        startsOn: input.startsOn ?? null,
        endsOn: input.endsOn ?? null,
      },
    });
  }

  async detail(orgId: string, id: string) {
    const campaign = await this.find(orgId, id);
    const pieces = await this.prisma.contentPiece.findMany({
      where: { organizationId: orgId, campaignId: campaign.id },
      select: PIECE_SELECT,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return { campaign, pieces, stats: stats(pieces) };
  }

  async update(orgId: string, id: string, input: CampaignInput) {
    const current = await this.find(orgId, id);
    const startsOn = input.startsOn === undefined ? current.startsOn : input.startsOn;
    const endsOn = input.endsOn === undefined ? current.endsOn : input.endsOn;
    checkDates(startsOn, endsOn);
    return this.prisma.campaign.update({
      where: { id: current.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.startsOn !== undefined ? { startsOn: input.startsOn } : {}),
        ...(input.endsOn !== undefined ? { endsOn: input.endsOn } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
    });
  }

  /** Deleting a campaign keeps its content: the pieces are simply no longer grouped. */
  async remove(orgId: string, id: string) {
    const c = await this.find(orgId, id);
    await this.prisma.campaign.delete({ where: { id: c.id } });
    return { removed: true };
  }

  async addContent(orgId: string, id: string, contentIds: string[]) {
    const campaign = await this.find(orgId, id);
    if (campaign.status !== CampaignStatus.ACTIVE) {
      throw new ConflictException('Archived campaigns cannot receive new content');
    }
    const ids = [...new Set(contentIds)];
    const found = await this.prisma.contentPiece.findMany({
      where: { id: { in: ids }, organizationId: orgId },
      select: { id: true },
    });
    if (found.length !== ids.length) throw new NotFoundException('Some content was not found');
    await this.prisma.contentPiece.updateMany({
      where: { id: { in: ids }, organizationId: orgId },
      data: { campaignId: campaign.id },
    });
    return this.detail(orgId, campaign.id);
  }

  async removeContent(orgId: string, id: string, contentId: string) {
    const campaign = await this.find(orgId, id);
    const res = await this.prisma.contentPiece.updateMany({
      where: { id: contentId, organizationId: orgId, campaignId: campaign.id },
      data: { campaignId: null },
    });
    if (res.count === 0) throw new NotFoundException('That content is not in this campaign');
    return this.detail(orgId, campaign.id);
  }
}
