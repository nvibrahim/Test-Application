import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  changePasswordRequestSchema,
  evaluatePassword,
  forgotPasswordRequestSchema,
  passwordCheckRequestSchema,
  resetPasswordRequestSchema,
  signInRequestSchema,
  type ChangePasswordRequest,
  type PasswordCheckResponse,
  type SessionInfo,
  type SignInRequest,
  describePasswordProblem,
} from '@inspower/shared';
import { ZodPipe } from '../../platform/http/zod.pipe';
import { AllowDuringMaintenance, AllowDuringSetup, Public, SignedIn } from '../access/decorators';
import { authOf } from '../access/request-context';
import { CredentialsService } from './credentials.service';
import { CsrfService } from './csrf.service';
import { RecoveryService } from './recovery.service';
import { SecuritySettingsService } from './security-settings';
import { SessionsService } from './sessions.service';
import { OrganizationService } from '../organization/organization.service';
import { PrismaService } from '../../platform/database/prisma.service';

type PasswordCheckRequest = ReturnType<typeof passwordCheckRequestSchema.parse>;

@Controller('auth')
export class AuthController {
  constructor(
    private readonly credentials: CredentialsService,
    private readonly recovery: RecoveryService,
    private readonly sessions: SessionsService,
    private readonly security: SecuritySettingsService,
    private readonly csrf: CsrfService,
    private readonly organizations: OrganizationService,
    private readonly prisma: PrismaService,
  ) {}

  /** Issues the CSRF cookie and returns the token, for clients that have not loaded a page yet. */
  @Public()
  @Get('csrf')
  csrfToken(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return { token: this.csrf.ensureCookie(req, res) };
  }

  @Public()
  @Post('sign-in')
  @HttpCode(200)
  signIn(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body(new ZodPipe(signInRequestSchema)) body: SignInRequest,
  ) {
    return this.credentials.signIn(req, res, body);
  }

  @SignedIn('verify_two_factor', 'change_password', 'active')
  @AllowDuringSetup()
  @AllowDuringMaintenance()
  @Post('sign-out')
  @HttpCode(204)
  async signOut(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.credentials.signOut(req, res, authOf(req));
  }

  /** The web app's guard calls this on every page: who is signed in, which stage, when it expires. */
  @SignedIn('verify_two_factor', 'change_password', 'active')
  @AllowDuringSetup()
  @AllowDuringMaintenance()
  @Get('session')
  async session(@Req() req: Request): Promise<SessionInfo> {
    const auth = authOf(req);
    const [row, settings, user] = await Promise.all([
      this.sessions.current(auth.sessionId),
      this.security.read(auth.organizationId),
      this.prisma.user.findUniqueOrThrow({
        where: { id: auth.userId },
        select: { mustChangePassword: true, twoFactor: { select: { confirmedAt: true } } },
      }),
    ]);
    return {
      id: auth.sessionId,
      stage: auth.stage,
      user: {
        id: auth.userId,
        email: auth.email,
        fullName: auth.fullName,
        isSuperAdmin: auth.isSuperAdmin,
        permissions: [...auth.permissions],
        mustChangePassword: user.mustChangePassword,
        twoFactorEnabled: user.twoFactor?.confirmedAt != null,
      },
      idleExpiresAt: row.idleExpiresAt.toISOString(),
      absoluteExpiresAt: row.absoluteExpiresAt.toISOString(),
      warningMinutes: settings.session.warningMinutes,
      setupComplete: auth.setupComplete,
    };
  }

  /** "Stay signed in" from the idle warning. */
  @SignedIn('verify_two_factor', 'change_password', 'active')
  @AllowDuringSetup()
  @Post('session/extend')
  @HttpCode(200)
  async extend(@Req() req: Request) {
    const auth = authOf(req);
    const settings = await this.security.read(auth.organizationId);
    const result = await this.sessions.extend(auth.sessionId, settings);
    return {
      idleExpiresAt: result.idleExpiresAt.toISOString(),
      absoluteExpiresAt: result.absoluteExpiresAt.toISOString(),
    };
  }

  /** Used by the forced change-password screen and by Profile -> Security. */
  @SignedIn('change_password', 'active')
  @AllowDuringSetup()
  @Post('password/change')
  @HttpCode(200)
  changePassword(
    @Req() req: Request,
    @Body(new ZodPipe(changePasswordRequestSchema)) body: ChangePasswordRequest,
  ) {
    return this.credentials.changePassword(
      req,
      authOf(req),
      body.currentPassword,
      body.newPassword,
    );
  }

  /** Live strength feedback for forms. Shared rules only; breach and history checks happen on submit. */
  @Public()
  @Post('password/check')
  @HttpCode(200)
  async check(
    @Body(new ZodPipe(passwordCheckRequestSchema)) body: PasswordCheckRequest,
  ): Promise<PasswordCheckResponse> {
    const organizationId = await this.organizations.currentId();
    const settings = organizationId ? await this.security.read(organizationId) : null;
    const org = await this.organizations.current();
    const result = evaluatePassword(body.password, settings?.password, {
      email: body.email,
      fullName: body.fullName,
      organizationName: org?.legalName,
      appName: process.env['APP_NAME'],
    });
    return {
      ok: result.ok,
      score: result.score,
      problems: result.problems.map(describePasswordProblem),
    };
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(202)
  async forgot(
    @Req() req: Request,
    @Body(new ZodPipe(forgotPasswordRequestSchema)) body: { email: string },
  ) {
    await this.recovery.requestReset(req, body.email);
    return { message: 'If that email has an account, a reset link is on its way.' };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(200)
  async reset(
    @Req() req: Request,
    @Body(new ZodPipe(resetPasswordRequestSchema)) body: { token: string; newPassword: string },
  ) {
    await this.recovery.reset(req, body.token, body.newPassword);
    return { message: 'Your password was changed. Sign in with the new one.' };
  }
}
