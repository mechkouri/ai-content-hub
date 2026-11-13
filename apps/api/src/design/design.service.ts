import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const MAX_TEMPLATES_PER_ORG = 50;

export interface TemplateInput {
  name: string;
  category: string;
  spec: Record<string, unknown>;
}

/** An organization's own design templates: a layout, a format and sample text to start a picture from. */
@Injectable()
export class DesignService {
  constructor(private readonly prisma: PrismaService) {}

  list(orgId: string) {
    return this.prisma.designTemplate.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(orgId: string, actorId: string, input: TemplateInput) {
    const count = await this.prisma.designTemplate.count({ where: { organizationId: orgId } });
    if (count >= MAX_TEMPLATES_PER_ORG) {
      throw new ConflictException(
        `An organization can keep up to ${MAX_TEMPLATES_PER_ORG} templates. Delete one first.`,
      );
    }
    return this.prisma.designTemplate.create({
      data: {
        organizationId: orgId,
        createdById: actorId,
        name: input.name,
        category: input.category,
        spec: input.spec as Prisma.InputJsonValue,
      },
    });
  }

  private async find(orgId: string, id: string) {
    const t = await this.prisma.designTemplate.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!t) throw new NotFoundException('Template not found');
    return t;
  }

  async update(orgId: string, id: string, input: Partial<TemplateInput>) {
    await this.find(orgId, id);
    return this.prisma.designTemplate.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.spec !== undefined ? { spec: input.spec as Prisma.InputJsonValue } : {}),
      },
    });
  }

  async remove(orgId: string, id: string) {
    await this.find(orgId, id);
    await this.prisma.designTemplate.delete({ where: { id } });
    return { ok: true };
  }
}
