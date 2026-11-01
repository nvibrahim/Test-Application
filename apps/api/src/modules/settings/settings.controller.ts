import { Body, Controller, Get, HttpCode, Param, Post, Put, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  settingsSectionKeys,
  settingsSectionRules,
  type SettingsSectionKey,
} from '@inspower/shared';
import { z } from 'zod';
import { ApiException, forbidden } from '../../platform/http/api-error';
import { MailService } from '../../platform/mail/mail.service';
import { renderEmail } from '../../platform/mail/templates';
import { ZodPipe } from '../../platform/http/zod.pipe';
import {
  AllowDuringSetup,
  Public,
  RequirePermissions,
  RequireStepUp,
  SignedIn,
} from '../access/decorators';
import { authOf } from '../access/request-context';
import { StepUpService } from '../two-factor/step-up.service';
import { TransactionService } from '../../platform/transaction/transaction.service';
import { ctxOf } from '../auth/credentials.service';
import { SettingsService } from './settings.service';

const sectionParam = new ZodPipe(
  z.enum(settingsSectionKeys as [SettingsSectionKey, ...SettingsSectionKey[]]),
);

@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly stepUp: StepUpService,
    private readonly mail: MailService,
    private readonly transactions: TransactionService,
  ) {}

  /** Name, tagline, appearance and maintenance state: read by every page before sign-in. */
  @Public()
  @Get('public')
  async publicSettings(@Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'public, max-age=30');
    return this.settings.publicSettings();
  }

  /** The sections a person may see, with their rules, for the screen's tabs. */
  @SignedIn('active')
  @AllowDuringSetup()
  @Get()
  sections(@Req() req: Request) {
    const auth = authOf(req);
    const may = (p: string) => auth.isSuperAdmin || auth.permissions.has(p);
    if (!may('settings.read')) throw forbidden();
    return {
      sections: settingsSectionKeys.map((key) => ({
        key,
        ...settingsSectionRules[key],
        canEdit: may(settingsSectionRules[key].permission),
      })),
    };
  }

  @RequirePermissions('settings.read')
  @Get(':section')
  read(@Req() req: Request, @Param('section', sectionParam) section: SettingsSectionKey) {
    return this.settings.read(authOf(req).organizationId, section);
  }

  /** Permission and step-up depend on the section (see settingsSectionRules). */
  @SignedIn('active')
  @AllowDuringSetup()
  @Put(':section')
  async write(
    @Req() req: Request,
    @Param('section', sectionParam) section: SettingsSectionKey,
    @Body() body: unknown,
  ) {
    const auth = authOf(req);
    const rule = settingsSectionRules[section];
    if (!auth.isSuperAdmin && !auth.permissions.has(rule.permission)) throw forbidden();
    if (rule.stepUp && !(await this.stepUp.hasGrant(auth.sessionId)))
      throw new ApiException('step_up_required', 'Confirm it is you to continue');
    if (typeof body !== 'object' || body === null || Array.isArray(body))
      throw new ApiException('validation_failed', 'Send the section as an object');
    return this.settings.write(req, auth, section, body as Record<string, unknown>);
  }

  /** Sends a test email to the signed-in person with the saved settings; nothing has to be saved first. */
  @RequirePermissions('settings.manage')
  @RequireStepUp()
  @Post('email/test')
  @HttpCode(200)
  async test(@Req() req: Request) {
    const auth = authOf(req);
    const rendered = renderEmail({
      name: 'test',
      params: { appName: process.env['APP_NAME'] ?? 'Inspower' },
    });
    try {
      const result = await this.mail.send(auth.organizationId, {
        to: auth.email,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
      });
      await this.transactions.run(ctxOf(req, auth), ({ audit }) =>
        audit({
          action: 'settings.email.tested',
          entityType: 'settings',
          entityId: 'email',
          changes: { to: auth.email, ok: true },
        }),
      );
      return { ok: true, message: `Sent to ${auth.email} (${result.messageId}).` };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.transactions.run(ctxOf(req, auth), ({ audit }) =>
        audit({
          action: 'settings.email.tested',
          entityType: 'settings',
          entityId: 'email',
          changes: { to: auth.email, ok: false, error: message },
        }),
      );
      return { ok: false, message: `The mail server refused: ${message}` };
    }
  }
}
