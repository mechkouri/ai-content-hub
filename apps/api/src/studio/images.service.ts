import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ContentKind } from '@prisma/client';
import { AiService } from '../ai/ai.service';
import { MediaService } from '../brand/media.service';
import { PrismaService } from '../prisma/prisma.service';
import { ApprovalsService } from './approvals.service';

/** How many images each kind of content can carry (the networks' own limits, rounded down). */
export const MAX_IMAGES: Record<ContentKind, number> = {
  ARTICLE: 1,
  INSTAGRAM: 10,
  FACEBOOK: 10,
  LINKEDIN: 9,
};

/** The image idea the writer produced for this content, used as the default picture prompt. */
export function imageBriefOf(kind: ContentKind, content: any): string | null {
  const pick =
    kind === ContentKind.ARTICLE
      ? content?.featuredImageBrief
      : kind === ContentKind.INSTAGRAM
        ? content?.imageBrief
        : content?.images?.[0]?.brief;
  return typeof pick === 'string' && pick.trim() ? pick.trim() : null;
}

/** The description the writer produced for the picture at this position, used until a person edits it. */
export function altTextOf(kind: ContentKind, content: any, index: number): string | null {
  const pick =
    kind === ContentKind.ARTICLE
      ? content?.imageAltText
      : kind === ContentKind.INSTAGRAM
        ? content?.altText
        : content?.images?.[index]?.altText;
  return typeof pick === 'string' && pick.trim() ? pick.trim().slice(0, 500) : null;
}

/**
 * Pictures attached to a piece of content. Attaching, removing or generating one is an edit:
 * it voids any pending review or approval, because the post is no longer what was approved.
 */
@Injectable()
export class ImagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly ai: AiService,
    private readonly approvals: ApprovalsService,
  ) {}

  private async piece(orgId: string, id: string) {
    const p = await this.prisma.contentPiece.findFirst({ where: { id, organizationId: orgId } });
    if (!p) throw new NotFoundException('Content not found');
    return p;
  }

  async list(orgId: string, contentId: string) {
    const piece = await this.piece(orgId, contentId);
    return this.prisma.contentImage.findMany({
      where: { contentId: piece.id, organizationId: orgId },
      include: { asset: { select: { id: true, filename: true, mimeType: true, sizeBytes: true } } },
      orderBy: { position: 'asc' },
    });
  }

  async attach(
    orgId: string,
    contentId: string,
    assetId: string,
    actorId: string,
    /** Used as the description when the content has none of its own for this picture. */
    fallbackAlt?: string,
  ) {
    const piece = await this.piece(orgId, contentId);
    const asset = await this.prisma.mediaAsset.findFirst({
      where: { id: assetId, organizationId: orgId },
    });
    if (!asset) throw new NotFoundException('Image not found in your media library');

    const current = await this.prisma.contentImage.findMany({
      where: { contentId: piece.id },
      orderBy: { position: 'asc' },
    });
    if (current.some((c) => c.assetId === asset.id)) {
      throw new ConflictException('This image is already attached');
    }
    const max = MAX_IMAGES[piece.kind];
    if (current.length >= max) {
      throw new ConflictException(
        max === 1
          ? 'This content takes one image. Remove the current one first.'
          : `This content takes at most ${max} images.`,
      );
    }
    await this.prisma.contentImage.create({
      data: {
        organizationId: orgId,
        contentId: piece.id,
        assetId: asset.id,
        position: current.length ? current[current.length - 1].position + 1 : 0,
        altText:
          altTextOf(piece.kind, piece.content, current.length) ??
          (fallbackAlt?.trim().slice(0, 500) || null),
      },
    });
    await this.approvals.invalidateAfterEdit(orgId, piece, actorId);
    return this.list(orgId, piece.id);
  }

  async remove(orgId: string, contentId: string, assetId: string, actorId: string) {
    const piece = await this.piece(orgId, contentId);
    const res = await this.prisma.contentImage.deleteMany({
      where: { contentId: piece.id, assetId, organizationId: orgId },
    });
    if (res.count === 0) throw new NotFoundException('That image is not attached');
    await this.approvals.invalidateAfterEdit(orgId, piece, actorId);
    return this.list(orgId, piece.id);
  }

  /** Changes the description of one picture. An empty text removes it. Counts as an edit of the content. */
  async setAltText(
    orgId: string,
    contentId: string,
    assetId: string,
    actorId: string,
    altText: string,
  ) {
    const piece = await this.piece(orgId, contentId);
    const res = await this.prisma.contentImage.updateMany({
      where: { contentId: piece.id, assetId, organizationId: orgId },
      data: { altText: altText.trim() || null },
    });
    if (res.count === 0) throw new NotFoundException('That image is not attached');
    await this.approvals.invalidateAfterEdit(orgId, piece, actorId);
    return this.list(orgId, piece.id);
  }

  /** Draws a picture from the content's own image idea (or a custom prompt) and attaches it. */
  async generate(orgId: string, contentId: string, actorId: string, prompt?: string) {
    const piece = await this.piece(orgId, contentId);
    const text = prompt?.trim() || imageBriefOf(piece.kind, piece.content);
    if (!text) {
      throw new BadRequestException(
        'There is no image idea for this content. Describe the picture.',
      );
    }
    // Check the limit first: do not spend an AI image on something that cannot be attached.
    const count = await this.prisma.contentImage.count({ where: { contentId: piece.id } });
    if (count >= MAX_IMAGES[piece.kind]) {
      throw new ConflictException('This content already has the maximum number of images.');
    }
    const img = await this.ai.generateImage({ orgId, userId: actorId }, { prompt: text });
    const ext =
      img.mimeType === 'image/jpeg' ? 'jpg' : img.mimeType === 'image/webp' ? 'webp' : 'png';
    const asset = await this.media.upload(orgId, actorId, {
      buffer: img.data,
      originalname: `generated-${piece.id.slice(0, 8)}.${ext}`,
    });
    // A description the person wrote is a fair starting point for the picture's description.
    return this.attach(orgId, piece.id, asset.id, actorId, prompt);
  }
}
