import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { SetupOrganizationRequest, SetupStatus } from '@inspower/shared';
import { PrismaService } from '../../platform/database/prisma.service';
import { ApiException, forbidden } from '../../platform/http/api-error';
import { TransactionService } from '../../platform/transaction/transaction.service';
import type { AuthContext } from '../access/request-context';
import { AuthActions } from './auth.actions';
import { ctxOf } from './credentials.service';

/** First-run setup: the Super Admin completes the organization and the head office. */
@Injectable()
export class SetupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transactions: TransactionService,
  ) {}

  async status(auth: AuthContext): Promise<SetupStatus> {
    const [user, org, headOffice] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: auth.userId },
        select: { mustChangePassword: true },
      }),
      this.prisma.organization.findUniqueOrThrow({
        where: { id: auth.organizationId },
        select: { setupCompletedAt: true },
      }),
      this.prisma.location.findFirst({
        where: { organizationId: auth.organizationId, isHeadOffice: true },
        select: { id: true },
      }),
    ]);
    return {
      passwordChanged: !user.mustChangePassword,
      organizationCreated: org.setupCompletedAt != null,
      headOfficeCreated: headOffice != null,
      complete: org.setupCompletedAt != null && headOffice != null,
    };
  }

  async completeOrganization(
    req: Request,
    auth: AuthContext,
    input: SetupOrganizationRequest,
  ): Promise<SetupStatus> {
    if (!auth.isSuperAdmin) throw forbidden('Only a Super Admin can set up the organization');
    const [country, currency] = await Promise.all([
      this.prisma.country.findUnique({ where: { code: input.countryCode } }),
      this.prisma.currency.findUnique({ where: { code: input.currencyCode } }),
    ]);
    if (!country)
      throw new ApiException('validation_failed', 'Unknown country', [
        { path: 'countryCode', message: 'Unknown country' },
      ]);
    if (!currency)
      throw new ApiException('validation_failed', 'Unknown currency', [
        { path: 'currencyCode', message: 'Unknown currency' },
      ]);
    try {
      Intl.DateTimeFormat(undefined, { timeZone: input.timeZone });
    } catch {
      throw new ApiException('validation_failed', 'Unknown time zone', [
        { path: 'timeZone', message: 'Unknown time zone' },
      ]);
    }

    await this.transactions.run(ctxOf(req, auth), async ({ tx, audit, emit }) => {
      const before = await tx.organization.findUniqueOrThrow({
        where: { id: auth.organizationId },
      });
      if (before.setupCompletedAt)
        throw new ApiException('conflict', 'The organization is already set up');
      const after = await tx.organization.update({
        where: { id: auth.organizationId },
        data: {
          legalName: input.legalName,
          tradingName: input.tradingName || null,
          countryCode: input.countryCode,
          currencyCode: input.currencyCode,
          timeZone: input.timeZone,
          addressLines: input.addressLines,
          setupCompletedAt: new Date(),
          updatedBy: auth.userId,
          version: { increment: 1 },
        },
      });
      const existing = await tx.location.findFirst({
        where: { organizationId: auth.organizationId, isHeadOffice: true },
      });
      if (!existing) {
        await tx.location.create({
          data: {
            organizationId: auth.organizationId,
            name: input.headOffice.name,
            isHeadOffice: true,
            addressLines: input.headOffice.addressLines.length
              ? input.headOffice.addressLines
              : input.addressLines,
            timeZone: input.timeZone,
            createdBy: auth.userId,
          },
        });
      }
      await audit({
        action: AuthActions.setupOrganization,
        entityType: 'organization',
        entityId: auth.organizationId,
        changes: {
          before: { legalName: before.legalName },
          after: {
            legalName: after.legalName,
            countryCode: after.countryCode,
            currencyCode: after.currencyCode,
            timeZone: after.timeZone,
          },
        },
      });
      await emit({ name: 'organization.profile.updated', channels: ['organization'], payload: {} });
    });
    return this.status(auth);
  }
}
