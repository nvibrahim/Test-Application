import { createHash } from 'node:crypto';
import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { appearanceSettingsSchema, buildTheme, themeCss } from '@inspower/shared';
import { z } from 'zod';
import { PrismaService } from '../../platform/database/prisma.service';
import { ApiException, notFound } from '../../platform/http/api-error';
import { ZodPipe } from '../../platform/http/zod.pipe';
import { TransactionService } from '../../platform/transaction/transaction.service';
import { Public, RequirePermissions } from '../access/decorators';
import { authOf } from '../access/request-context';
import { ctxOf } from '../auth/credentials.service';
import { OrganizationService } from '../organization/organization.service';
import { SettingsReader } from '../settings/settings-reader';
import { BRAND_MAX_BYTES, BRAND_SLOTS, sniffImage, type BrandSlot } from './image-check';

const slotParam = new ZodPipe(z.enum(BRAND_SLOTS));

/**
 * The computed theme and the brand pictures. `/appearance` is public and cached with an ETag,
 * so the sign-in page is branded before anyone signs in. Pictures are checked by their bytes.
 */
@Controller()
export class AppearanceController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsReader,
    private readonly organizations: OrganizationService,
    private readonly transactions: TransactionService,
  ) {}

  @Public()
  @Get('appearance')
  async appearance(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const organizationId = await this.organizations.currentId();
    const settings = organizationId
      ? await this.settings.read(organizationId, 'appearance', appearanceSettingsSchema)
      : appearanceSettingsSchema.parse({});
    const theme = buildTheme(settings);
    const assets = organizationId
      ? await this.prisma.brandAsset.findMany({
          where: { organizationId },
          select: { slot: true, updatedAt: true },
        })
      : [];
    const body = {
      settings,
      theme: {
        brand: theme.brand,
        adjusted: theme.adjusted,
        light: theme.light,
        dark: theme.dark,
        attributes: theme.attributes,
      },
      css:
        settings.brandColor ||
        settings.sidebarStyle !== 'light' ||
        settings.topBarStyle !== 'plain' ||
        settings.cornerRadius !== 'medium'
          ? themeCss(theme)
          : '',
      assets: Object.fromEntries(
        assets.map((a) => [a.slot, `/api/v1/brand/${a.slot}?v=${a.updatedAt.getTime()}`]),
      ),
    };
    const etag = `"${createHash('sha1').update(JSON.stringify(body)).digest('hex')}"`;
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'public, max-age=60');
    if (req.header('if-none-match') === etag) {
      res.status(304);
      return undefined;
    }
    return body;
  }

  @Public()
  @Get('brand/:slot')
  @Header('Cache-Control', 'public, max-age=86400, immutable')
  async picture(@Param('slot', slotParam) slot: BrandSlot, @Res() res: Response) {
    const organizationId = await this.organizations.currentId();
    const asset = organizationId
      ? await this.prisma.brandAsset.findUnique({
          where: { organizationId_slot: { organizationId, slot } },
        })
      : null;
    if (!asset) throw notFound('No picture in this slot');
    // Served back only as the picture type read from its bytes, never as anything else.
    res.setHeader('Content-Type', asset.contentType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'inline');
    res.send(Buffer.from(asset.content));
  }

  /** The upload is the file itself as the body (image/png, image/jpeg or image/webp, up to 1 MB). */
  @RequirePermissions('settings.manage')
  @Put('settings/brand/:slot')
  async upload(
    @Req() req: Request,
    @Param('slot', slotParam) slot: BrandSlot,
    @Body() body: Buffer,
  ) {
    const auth = authOf(req);
    if (!Buffer.isBuffer(body) || !body.length)
      throw new ApiException('validation_failed', 'Send the picture as the request body');
    if (body.length > BRAND_MAX_BYTES)
      throw new ApiException('validation_failed', 'The picture must be 1 MB or smaller');
    const image = sniffImage(body);
    if (!image)
      throw new ApiException(
        'validation_failed',
        'Use a PNG, JPG or WebP picture. SVG is not accepted.',
      );
    if (slot === 'favicon' && image.type !== 'image/png')
      throw new ApiException('validation_failed', 'The browser-tab icon must be a PNG');
    if (slot === 'favicon' && image.width && image.width !== image.height)
      throw new ApiException('validation_failed', 'The browser-tab icon must be square');
    await this.transactions.run(ctxOf(req, auth), async ({ tx, audit, emit }) => {
      await tx.brandAsset.upsert({
        where: { organizationId_slot: { organizationId: auth.organizationId, slot } },
        update: {
          contentType: image.type,
          sizeBytes: body.length,
          content: new Uint8Array(body),
          updatedBy: auth.userId,
        },
        create: {
          organizationId: auth.organizationId,
          slot,
          contentType: image.type,
          sizeBytes: body.length,
          content: new Uint8Array(body),
          updatedBy: auth.userId,
        },
      });
      await audit({
        action: 'settings.brand.uploaded',
        entityType: 'brand_asset',
        entityId: slot,
        changes: { type: image.type, bytes: body.length, width: image.width, height: image.height },
      });
      await emit({ name: 'settings.brand.updated', channels: ['organization'], payload: { slot } });
    });
    return { slot, type: image.type, bytes: body.length, width: image.width, height: image.height };
  }

  @RequirePermissions('settings.manage')
  @Delete('settings/brand/:slot')
  @HttpCode(204)
  async remove(@Req() req: Request, @Param('slot', slotParam) slot: BrandSlot): Promise<void> {
    const auth = authOf(req);
    await this.transactions.run(ctxOf(req, auth), async ({ tx, audit, emit }) => {
      await tx.brandAsset.deleteMany({ where: { organizationId: auth.organizationId, slot } });
      await audit({ action: 'settings.brand.removed', entityType: 'brand_asset', entityId: slot });
      await emit({ name: 'settings.brand.updated', channels: ['organization'], payload: { slot } });
    });
  }
}
