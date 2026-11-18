import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { detectImageType, sanitizeFilename } from '../storage/image-type';
import { STORAGE, StorageProvider } from '../storage/storage';
import { PrismaService } from '../prisma/prisma.service';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE) private readonly storage: StorageProvider,
  ) {}

  async upload(orgId: string, userId: string, file?: { buffer: Buffer; originalname: string }) {
    if (!file?.buffer?.length) throw new BadRequestException('A non-empty "file" is required');
    if (file.buffer.length > MAX_UPLOAD_BYTES)
      throw new PayloadTooLargeException('Max file size is 5 MB');
    // Trust the file's content, never the client-declared type.
    const type = detectImageType(file.buffer);
    if (!type) throw new BadRequestException('Only PNG, JPEG, WebP and GIF images are allowed');

    const storageKey = `${orgId}/${randomUUID()}.${type.ext}`;
    await this.storage.put(storageKey, file.buffer);
    try {
      return await this.prisma.mediaAsset.create({
        data: {
          organizationId: orgId,
          filename: sanitizeFilename(file.originalname),
          mimeType: type.mime,
          sizeBytes: file.buffer.length,
          storageKey,
          createdById: userId,
        },
      });
    } catch (e) {
      await this.storage.delete(storageKey);
      throw e;
    }
  }

  /**
   * Stores a picture that this server has already checked and converted (for example one imported from a stock
   * site). Unlike {@link upload} it takes no client file, so it needs no extra size limit beyond the caller's.
   */
  async addProcessed(
    orgId: string,
    userId: string,
    file: { buffer: Buffer; filename: string; mimeType: string },
  ) {
    const type = detectImageType(file.buffer);
    if (!type || type.mime !== file.mimeType)
      throw new BadRequestException('Only PNG, JPEG, WebP and GIF images are allowed');
    const storageKey = `${orgId}/${randomUUID()}.${type.ext}`;
    await this.storage.put(storageKey, file.buffer);
    try {
      return await this.prisma.mediaAsset.create({
        data: {
          organizationId: orgId,
          filename: sanitizeFilename(file.filename),
          mimeType: type.mime,
          sizeBytes: file.buffer.length,
          storageKey,
          createdById: userId,
        },
      });
    } catch (e) {
      await this.storage.delete(storageKey);
      throw e;
    }
  }

  list(orgId: string) {
    return this.prisma.mediaAsset.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  private async find(orgId: string, id: string) {
    // Always scoped by organization: an asset id from another tenant is simply "not found".
    const asset = await this.prisma.mediaAsset.findFirst({ where: { id, organizationId: orgId } });
    if (!asset) throw new NotFoundException('Media not found');
    return asset;
  }

  async content(orgId: string, id: string) {
    const asset = await this.find(orgId, id);
    return { asset, data: await this.storage.get(asset.storageKey) };
  }

  async remove(orgId: string, id: string) {
    const asset = await this.find(orgId, id);
    await this.prisma.mediaAsset.delete({ where: { id: asset.id } });
    await this.storage.delete(asset.storageKey);
    return { removed: true };
  }
}
