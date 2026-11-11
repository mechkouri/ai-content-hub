import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex color like #1877F2');
const font = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .regex(/^[\p{L}\p{N} _.-]+$/u, 'Invalid font name');
const httpUrl = z
  .string()
  .url()
  .max(300)
  .refine((u) => /^https?:\/\//i.test(u), 'Only http(s) URLs are allowed');

export const brandKitSchema = z.object({
  label: z.string().trim().max(100).optional(),
  description: z.string().trim().max(1000).optional(),
  websiteUrl: httpUrl.optional(),
  defaultLanguage: z.enum(['fr', 'ar', 'en']).optional(),
  primaryColor: hex.optional(),
  secondaryColor: hex.optional(),
  accentColor: hex.optional(),
  headingFont: font.optional(),
  bodyFont: font.optional(),
  imageStyle: z.string().trim().max(300).optional(),
  socialUrls: z
    .object({
      facebook: httpUrl,
      instagram: httpUrl,
      linkedin: httpUrl,
      x: httpUrl,
      youtube: httpUrl,
      tiktok: httpUrl,
    })
    .partial()
    .strict()
    .optional(),
  mainLogoId: z.string().uuid().nullable().optional(),
  altLogoId: z.string().uuid().nullable().optional(),
});
export type BrandKitInput = z.infer<typeof brandKitSchema>;

@Injectable()
export class BrandKitService {
  constructor(private readonly prisma: PrismaService) {}

  list(orgId: string) {
    return this.prisma.brandKit.findMany({
      where: { organizationId: orgId },
      orderBy: { version: 'desc' },
    });
  }

  async getActive(orgId: string) {
    const kit = await this.prisma.brandKit.findFirst({
      where: { organizationId: orgId, isActive: true },
    });
    if (!kit) throw new NotFoundException('This organization has no brand kit yet');
    return kit;
  }

  private async assertLogosBelongToOrg(orgId: string, ids: (string | null | undefined)[]) {
    const wanted = [...new Set(ids.filter((v): v is string => !!v))];
    if (!wanted.length) return;
    const found = await this.prisma.mediaAsset.count({
      where: { id: { in: wanted }, organizationId: orgId },
    });
    if (found !== wanted.length)
      throw new BadRequestException('Logo must be a media asset of this organization');
  }

  /** Saves a new version and makes it the active one. Omitted fields inherit from the previous active version. */
  async createVersion(orgId: string, userId: string, input: BrandKitInput) {
    await this.assertLogosBelongToOrg(orgId, [input.mainLogoId, input.altLogoId]);

    return this.prisma.$transaction(async (tx) => {
      const prev = await tx.brandKit.findFirst({
        where: { organizationId: orgId },
        orderBy: { version: 'desc' },
      });
      const base = prev?.isActive
        ? prev
        : await tx.brandKit.findFirst({ where: { organizationId: orgId, isActive: true } });
      await tx.brandKit.updateMany({
        where: { organizationId: orgId, isActive: true },
        data: { isActive: false },
      });
      return tx.brandKit.create({
        data: {
          organizationId: orgId,
          version: (prev?.version ?? 0) + 1,
          isActive: true,
          createdById: userId,
          label: input.label ?? null,
          description: input.description ?? base?.description ?? null,
          websiteUrl: input.websiteUrl ?? base?.websiteUrl ?? null,
          defaultLanguage: input.defaultLanguage ?? base?.defaultLanguage ?? 'en',
          primaryColor: input.primaryColor ?? base?.primaryColor ?? '#1877F2',
          secondaryColor: input.secondaryColor ?? base?.secondaryColor ?? '#0F172A',
          accentColor: input.accentColor ?? base?.accentColor ?? '#F59E0B',
          headingFont: input.headingFont ?? base?.headingFont ?? 'Inter',
          bodyFont: input.bodyFont ?? base?.bodyFont ?? 'Inter',
          imageStyle: input.imageStyle ?? base?.imageStyle ?? null,
          socialUrls: (input.socialUrls ?? base?.socialUrls ?? {}) as object,
          mainLogoId:
            input.mainLogoId === undefined ? (base?.mainLogoId ?? null) : input.mainLogoId,
          altLogoId: input.altLogoId === undefined ? (base?.altLogoId ?? null) : input.altLogoId,
        },
      });
    });
  }

  async activate(orgId: string, id: string) {
    const kit = await this.prisma.brandKit.findFirst({ where: { id, organizationId: orgId } });
    if (!kit) throw new NotFoundException('Brand kit version not found');
    await this.prisma.$transaction([
      this.prisma.brandKit.updateMany({
        where: { organizationId: orgId, isActive: true },
        data: { isActive: false },
      }),
      this.prisma.brandKit.update({ where: { id: kit.id }, data: { isActive: true } }),
    ]);
    return this.prisma.brandKit.findUnique({ where: { id: kit.id } });
  }
}
