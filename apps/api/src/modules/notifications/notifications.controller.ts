import { Body, Controller, Get, HttpCode, Post, Put, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { updateNotificationPreferencesSchema } from '@inspower/shared';
import { z } from 'zod';
import { ZodPipe } from '../../platform/http/zod.pipe';
import { AllowDuringSetup, SignedIn } from '../access/decorators';
import { authOf } from '../access/request-context';
import { NotificationsService } from './notifications.service';

const listQuery = z.object({
  cursor: z.string().uuid().optional(),
  unread: z.enum(['true', 'false']).optional(),
});
const markRead = z.object({
  ids: z.union([z.literal('all'), z.array(z.string().uuid()).max(100)]),
});

@Controller()
@SignedIn('active')
@AllowDuringSetup()
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('notifications')
  list(
    @Req() req: Request,
    @Query(new ZodPipe(listQuery)) q: { cursor?: string; unread?: string },
  ) {
    return this.notifications.list(authOf(req), q.cursor, q.unread === 'true');
  }

  @Get('notifications/unread')
  async unread(@Req() req: Request) {
    return { unread: await this.notifications.unreadCount(authOf(req).userId) };
  }

  @Post('notifications/read')
  @HttpCode(200)
  read(@Req() req: Request, @Body(new ZodPipe(markRead)) body: { ids: 'all' | string[] }) {
    return this.notifications.markRead(authOf(req), body.ids);
  }

  @Get('profile/notifications')
  preferences(@Req() req: Request) {
    return this.notifications.preferences(authOf(req));
  }

  @Put('profile/notifications')
  update(
    @Req() req: Request,
    @Body(new ZodPipe(updateNotificationPreferencesSchema))
    body: { preferences: { type: string; inApp: boolean; email: boolean }[] },
  ) {
    return this.notifications.updatePreferences(req, authOf(req), body.preferences);
  }
}
