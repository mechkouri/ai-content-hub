import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export function slugify(name: string): string {
  const base = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${base || 'org'}-${randomBytes(3).toString('hex')}`;
}

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, name: string, defaultLanguage?: string) {
    return this.prisma.organization.create({
      data: {
        name,
        slug: slugify(name),
        ...(defaultLanguage ? { defaultLanguage } : {}),
        memberships: { create: { userId, role: Role.OWNER } },
      },
    });
  }

  listForUser(userId: string) {
    return this.prisma.membership.findMany({
      where: { userId },
      include: { organization: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async get(orgId: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  update(orgId: string, data: { name?: string; defaultLanguage?: string }) {
    return this.prisma.organization.update({ where: { id: orgId }, data });
  }
}
