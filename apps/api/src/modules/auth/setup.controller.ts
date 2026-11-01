import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { setupOrganizationRequestSchema, type SetupOrganizationRequest } from '@inspower/shared';
import { PrismaService } from '../../platform/database/prisma.service';
import { ZodPipe } from '../../platform/http/zod.pipe';
import { AllowDuringSetup, SignedIn } from '../access/decorators';
import { authOf } from '../access/request-context';
import { SetupService } from './setup.service';

@Controller('setup')
@SignedIn('active')
@AllowDuringSetup()
export class SetupController {
  constructor(
    private readonly setup: SetupService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('status')
  status(@Req() req: Request) {
    return this.setup.status(authOf(req));
  }

  /** Reference lists for the wizard's drop-downs. */
  @Get('reference')
  async reference() {
    const [countries, currencies] = await Promise.all([
      this.prisma.country.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.currency.findMany({ orderBy: { code: 'asc' } }),
    ]);
    return { countries, currencies, timeZones: Intl.supportedValuesOf('timeZone') };
  }

  @Post('organization')
  organization(
    @Req() req: Request,
    @Body(new ZodPipe(setupOrganizationRequestSchema)) body: SetupOrganizationRequest,
  ) {
    return this.setup.completeOrganization(req, authOf(req), body);
  }
}
