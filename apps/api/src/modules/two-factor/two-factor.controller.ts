import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  stepUpRequestSchema,
  twoFactorConfirmRequestSchema,
  twoFactorVerifyRequestSchema,
  type StepUpRequest,
  type TwoFactorVerifyRequest,
} from '@inspower/shared';
import { z } from 'zod';
import { ZodPipe } from '../../platform/http/zod.pipe';
import { AllowDuringSetup, RequireStepUp, SignedIn } from '../access/decorators';
import { authOf } from '../access/request-context';
import { SecuritySettingsService } from '../auth/security-settings';
import { StepUpService } from './step-up.service';
import { TwoFactorService } from './two-factor.service';

@Controller('two-factor')
@SignedIn('active')
@AllowDuringSetup()
export class TwoFactorController {
  constructor(private readonly twoFactor: TwoFactorService) {}

  @Get()
  status(@Req() req: Request) {
    return this.twoFactor.status(req, authOf(req));
  }

  @Post('setup')
  @HttpCode(200)
  setup(@Req() req: Request) {
    return this.twoFactor.setup(req, authOf(req));
  }

  @Post('confirm')
  @HttpCode(200)
  confirm(
    @Req() req: Request,
    @Body(new ZodPipe(twoFactorConfirmRequestSchema)) body: { code: string },
  ) {
    return this.twoFactor.confirm(req, authOf(req), body.code);
  }

  @RequireStepUp()
  @Post('disable')
  @HttpCode(204)
  async disable(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.twoFactor.disable(req, res, authOf(req));
  }

  @RequireStepUp()
  @Post('recovery-codes/regenerate')
  @HttpCode(200)
  regenerate(@Req() req: Request) {
    return this.twoFactor.regenerateRecoveryCodes(req, authOf(req));
  }

  @Delete('trusted-devices/:id')
  @HttpCode(204)
  async revokeDevice(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param('id', new ZodPipe(z.string().uuid())) id: string,
  ): Promise<void> {
    await this.twoFactor.revokeTrustedDevice(req, res, authOf(req), id);
  }

  @Post('reminder/dismiss')
  @HttpCode(204)
  async dismiss(@Req() req: Request): Promise<void> {
    await this.twoFactor.dismissReminder(req, authOf(req));
  }
}

/** Routes that belong to the sign-in flow and to step-up live under /auth. */
@Controller('auth')
export class TwoFactorAuthController {
  constructor(
    private readonly twoFactor: TwoFactorService,
    private readonly stepUp: StepUpService,
    private readonly security: SecuritySettingsService,
  ) {}

  /** What the verify screen needs to know: how long a trusted device lasts (0 hides the option). */
  @SignedIn('verify_two_factor', 'active')
  @AllowDuringSetup()
  @Get('two-factor/settings')
  async settings(@Req() req: Request) {
    const settings = await this.security.read(authOf(req).organizationId);
    return { trustedDeviceDays: settings.twoFactor.trustedDeviceDays };
  }

  @SignedIn('verify_two_factor')
  @AllowDuringSetup()
  @Post('two-factor/verify')
  @HttpCode(200)
  verify(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body(new ZodPipe(twoFactorVerifyRequestSchema)) body: TwoFactorVerifyRequest,
  ) {
    return this.twoFactor.verifySession(req, res, authOf(req), body);
  }

  @SignedIn('active')
  @AllowDuringSetup()
  @Get('step-up')
  stepUpStatus(@Req() req: Request) {
    return this.stepUp.status(authOf(req));
  }

  @SignedIn('active')
  @AllowDuringSetup()
  @Post('step-up')
  @HttpCode(200)
  stepUpVerify(@Req() req: Request, @Body(new ZodPipe(stepUpRequestSchema)) body: StepUpRequest) {
    return this.stepUp.verify(req, authOf(req), body);
  }
}
