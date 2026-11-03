import { Body, Controller, Get, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import {
  sensitiveOrganizationFields,
  updateOrganizationSchema,
  type OrganizationProfile,
} from '@inspower/shared';
import { PrismaService } from '../../platform/database/prisma.service';
import { ApiException, conflict, notFound } from '../../platform/http/api-error';
import { ZodPipe } from '../../platform/http/zod.pipe';
import { TransactionService } from '../../platform/transaction/transaction.service';
import { RequirePermissions } from '../access/decorators';
import { authOf } from '../access/request-context';
import { ctxOf } from '../auth/credentials.service';
import { SettingsReader } from '../settings/settings-reader';
import { StepUpService } from '../two-factor/step-up.service';

type Update = ReturnType<typeof updateOrganizationSchema.parse>;

@Controller('organization')
export class OrganizationController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transactions: TransactionService,
    private readonly stepUp: StepUpService,
    private readonly settings: SettingsReader,
  ) {}

  private toProfile(
    o: NonNullable<Awaited<ReturnType<PrismaService['organization']['findFirst']>>>,
  ): OrganizationProfile {
    return {
      id: o.id,
      legalName: o.legalName,
      tradingName: o.tradingName,
      countryCode: o.countryCode,
      currencyCode: o.currencyCode,
      timeZone: o.timeZone,
      dateFormat: o.dateFormat,
      numberFormat: o.numberFormat,
      weekStartsOn: o.weekStartsOn,
      addressLines: o.addressLines,
      documentFooter: o.documentFooter,
      setupCompletedAt: o.setupCompletedAt?.toISOString() ?? null,
      version: o.version,
    };
  }

  @RequirePermissions('organization.read')
  @Get()
  async get(@Req() req: Request) {
    const o = await this.prisma.organization.findUnique({
      where: { id: authOf(req).organizationId },
    });
    if (!o) throw notFound();
    return this.toProfile(o);
  }

  /** Legal name, country and currency ask for step-up; every save checks the version. */
  @RequirePermissions('organization.manage')
  @Put()
  async update(@Req() req: Request, @Body(new ZodPipe(updateOrganizationSchema)) body: Update) {
    const auth = authOf(req);
    const before = await this.prisma.organization.findUnique({
      where: { id: auth.organizationId },
    });
    if (!before) throw notFound();
    if (before.version !== body.version)
      throw conflict('Someone else saved the organization first. Reload and try again.');
    const { version: _v, ...changes } = body;
    const changed = Object.entries(changes).filter(
      ([k, v]) =>
        v !== undefined &&
        JSON.stringify(v) !== JSON.stringify((before as Record<string, unknown>)[k]),
    );
    const sensitive = changed.some(([k]) =>
      (sensitiveOrganizationFields as readonly string[]).includes(k),
    );
    if (sensitive && !(await this.stepUp.hasGrant(auth.sessionId)))
      throw new ApiException(
        'step_up_required',
        'Changing the legal name, country or currency needs step-up',
      );
    if (
      body.countryCode &&
      !(await this.prisma.country.findUnique({ where: { code: body.countryCode } }))
    )
      throw new ApiException('validation_failed', 'Unknown country');
    if (
      body.currencyCode &&
      !(await this.prisma.currency.findUnique({ where: { code: body.currencyCode } }))
    )
      throw new ApiException('validation_failed', 'Unknown currency');
    if (body.timeZone) {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: body.timeZone });
      } catch {
        throw new ApiException('validation_failed', 'Unknown time zone');
      }
    }
    const after = await this.transactions.run(ctxOf(req, auth), async ({ tx, audit, emit }) => {
      const row = await tx.organization.update({
        where: { id: auth.organizationId },
        data: { ...Object.fromEntries(changed), version: { increment: 1 }, updatedBy: auth.userId },
      });
      await audit({
        action: 'organization.profile.updated',
        entityType: 'organization',
        entityId: row.id,
        changes: {
          before: Object.fromEntries(
            changed.map(([k]) => [k, (before as Record<string, unknown>)[k]]),
          ),
          after: Object.fromEntries(changed),
        },
      });
      await emit({ name: 'organization.profile.updated', channels: ['organization'], payload: {} });
      return row;
    });
    await this.settings.invalidate(auth.organizationId, 'general');
    return this.toProfile(after);
  }
}
