import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import { updatePreferencesRequestSchema, updateProfileRequestSchema } from '@inspower/shared';
import { z } from 'zod';
import { ZodPipe } from '../../platform/http/zod.pipe';
import { AllowDuringSetup, SignedIn } from '../access/decorators';
import { authOf } from '../access/request-context';
import { ProfileService } from './profile.service';

type UpdateProfile = ReturnType<typeof updateProfileRequestSchema.parse>;
type UpdatePreferences = ReturnType<typeof updatePreferencesRequestSchema.parse>;

@Controller('profile')
@SignedIn('active')
@AllowDuringSetup()
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Get()
  me(@Req() req: Request) {
    return this.profile.me(authOf(req));
  }

  @Put()
  update(@Req() req: Request, @Body(new ZodPipe(updateProfileRequestSchema)) body: UpdateProfile) {
    return this.profile.updatePersonal(req, authOf(req), body);
  }

  @Put('preferences')
  preferences(
    @Req() req: Request,
    @Body(new ZodPipe(updatePreferencesRequestSchema)) body: UpdatePreferences,
  ) {
    return this.profile.updatePreferences(req, authOf(req), body);
  }

  @Get('sessions')
  async sessions(@Req() req: Request) {
    return { sessions: await this.profile.listSessions(authOf(req)) };
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  async revoke(
    @Req() req: Request,
    @Param('id', new ZodPipe(z.string().uuid())) id: string,
  ): Promise<void> {
    await this.profile.revokeSession(req, authOf(req), id);
  }

  @Post('sessions/sign-out-others')
  @HttpCode(200)
  signOutOthers(@Req() req: Request) {
    return this.profile.signOutOthers(req, authOf(req));
  }
}
