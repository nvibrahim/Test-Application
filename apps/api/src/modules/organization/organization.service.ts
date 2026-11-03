import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../platform/database/prisma.service';

/**
 * One organization per database. Its row is created by `inspower admin create` (as a stub)
 * and completed by the first-run setup wizard. Everything scoped by organization asks here.
 */
@Injectable()
export class OrganizationService {
  constructor(private readonly prisma: PrismaService) {}

  async current() {
    return this.prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } });
  }

  async currentId(): Promise<string | null> {
    const org = await this.prisma.organization.findFirst({
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    return org?.id ?? null;
  }

  async isSetupComplete(organizationId: string): Promise<boolean> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { setupCompletedAt: true },
    });
    return org?.setupCompletedAt != null;
  }
}
