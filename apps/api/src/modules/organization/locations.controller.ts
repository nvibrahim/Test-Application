import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../../platform/database/prisma.service';
import { RequirePermissions } from '../access/decorators';
import { authOf } from '../access/request-context';
import { scopeOf } from '../access/scoped';

/** The list a person may see. Adding and editing locations arrive with Phase 4. */
@Controller('locations')
export class LocationsController {
  constructor(private readonly prisma: PrismaService) {}

  @RequirePermissions('locations.read')
  @Get()
  async list(@Req() req: Request) {
    const auth = authOf(req);
    const visible = scopeOf(auth);
    const rows = await this.prisma.location.findMany({
      where: {
        organizationId: auth.organizationId,
        ...(visible ? { id: { in: [...visible] } } : {}),
      },
      orderBy: [{ isHeadOffice: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true, isHeadOffice: true, isActive: true },
    });
    return { locations: rows };
  }
}
