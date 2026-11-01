import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  acceptInvitationRequestSchema,
  emailChangeConfirmSchema,
  emailChangeRequestSchema,
  inviteUserRequestSchema,
  updateUserRequestSchema,
  userListQuerySchema,
} from '@inspower/shared';
import { z } from 'zod';
import { ZodPipe } from '../../platform/http/zod.pipe';
import {
  AllowDuringSetup,
  Public,
  RequirePermissions,
  RequireStepUp,
  SignedIn,
} from '../access/decorators';
import { authOf } from '../access/request-context';
import { TwoFactorService } from '../two-factor/two-factor.service';
import { UsersService } from './users.service';

type ListQuery = ReturnType<typeof userListQuerySchema.parse>;
type Invite = ReturnType<typeof inviteUserRequestSchema.parse>;
type Update = ReturnType<typeof updateUserRequestSchema.parse>;
const uuid = new ZodPipe(z.string().uuid());

@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly twoFactor: TwoFactorService,
  ) {}

  @RequirePermissions('users.read')
  @Get()
  list(@Req() req: Request, @Query(new ZodPipe(userListQuerySchema)) query: ListQuery) {
    return this.users.list(authOf(req), query);
  }

  @RequirePermissions('users.invite')
  @RequireStepUp()
  @Post()
  invite(@Req() req: Request, @Body(new ZodPipe(inviteUserRequestSchema)) body: Invite) {
    return this.users.invite(req, authOf(req), body);
  }

  @RequirePermissions('users.read')
  @Get(':id')
  detail(@Req() req: Request, @Param('id', uuid) id: string) {
    return this.users.detail(authOf(req), id);
  }

  @RequirePermissions('users.read')
  @Get(':id/activity')
  activity(@Req() req: Request, @Param('id', uuid) id: string) {
    return this.users.activity(authOf(req), id);
  }

  @RequirePermissions('users.manage')
  @RequireStepUp()
  @Put(':id')
  update(
    @Req() req: Request,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(updateUserRequestSchema)) body: Update,
  ) {
    return this.users.update(req, authOf(req), id, body);
  }

  @RequirePermissions('users.invite')
  @Post(':id/invitation/resend')
  @HttpCode(200)
  resend(@Req() req: Request, @Param('id', uuid) id: string) {
    return this.users.resendInvitation(req, authOf(req), id);
  }

  @RequirePermissions('users.manage')
  @RequireStepUp()
  @Post(':id/disable')
  @HttpCode(200)
  disable(@Req() req: Request, @Param('id', uuid) id: string) {
    return this.users.setDisabled(req, authOf(req), id, true);
  }

  @RequirePermissions('users.manage')
  @RequireStepUp()
  @Post(':id/enable')
  @HttpCode(200)
  enable(@Req() req: Request, @Param('id', uuid) id: string) {
    return this.users.setDisabled(req, authOf(req), id, false);
  }

  @RequirePermissions('users.manage')
  @RequireStepUp()
  @Post(':id/anonymise')
  @HttpCode(200)
  anonymise(@Req() req: Request, @Param('id', uuid) id: string) {
    return this.users.anonymise(req, authOf(req), id);
  }

  @RequirePermissions('users.superadmin.manage')
  @RequireStepUp()
  @Post(':id/super-admin')
  @HttpCode(200)
  grantSuperAdmin(@Req() req: Request, @Param('id', uuid) id: string) {
    return this.users.setSuperAdmin(req, authOf(req), id, true);
  }

  @RequirePermissions('users.superadmin.manage')
  @RequireStepUp()
  @Delete(':id/super-admin')
  @HttpCode(200)
  removeSuperAdmin(@Req() req: Request, @Param('id', uuid) id: string) {
    return this.users.setSuperAdmin(req, authOf(req), id, false);
  }

  @RequirePermissions('users.manage')
  @RequireStepUp()
  @Post(':id/two-factor/reset')
  @HttpCode(204)
  async reset(@Req() req: Request, @Param('id', uuid) id: string): Promise<void> {
    await this.twoFactor.adminReset(req, authOf(req), id);
  }

  @RequirePermissions('users.manage')
  @Post(':id/two-factor/remind')
  @HttpCode(204)
  async remind(@Req() req: Request, @Param('id', uuid) id: string): Promise<void> {
    await this.twoFactor.sendReminderNow(req, authOf(req), id);
  }
}

/** Invitation acceptance and email-change confirmation: no session yet, or a self-service action. */
@Controller()
export class InvitationsController {
  constructor(private readonly users: UsersService) {}

  @Public()
  @Get('invitations/:token')
  preview(@Param('token', new ZodPipe(z.string().min(16).max(256))) token: string) {
    return this.users.previewInvitation(token);
  }

  @Public()
  @Post('invitations/accept')
  @HttpCode(200)
  async accept(
    @Req() req: Request,
    @Body(new ZodPipe(acceptInvitationRequestSchema)) body: { token: string; password: string },
  ) {
    await this.users.acceptInvitation(req, body.token, body.password);
    return { message: 'Your account is ready. Sign in with your new password.' };
  }

  @SignedIn('active')
  @AllowDuringSetup()
  @Post('profile/email-change')
  @HttpCode(202)
  async requestEmailChange(
    @Req() req: Request,
    @Body(new ZodPipe(emailChangeRequestSchema)) body: { newEmail: string; password: string },
  ) {
    await this.users.requestEmailChange(req, authOf(req), body.newEmail, body.password);
    return { message: 'Check the new address for a confirmation link.' };
  }

  @Public()
  @Post('profile/email-change/confirm')
  @HttpCode(200)
  confirmEmailChange(
    @Req() req: Request,
    @Body(new ZodPipe(emailChangeConfirmSchema)) body: { token: string },
  ) {
    return this.users.confirmEmailChange(req, body.token);
  }
}
