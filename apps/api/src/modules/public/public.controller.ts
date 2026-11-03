import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { generalSettingsSchema } from '@inspower/shared';
import { z } from 'zod';
import { ApiException } from '../../platform/http/api-error';
import { QueueService } from '../../platform/jobs/queue.service';
import { RedisService } from '../../platform/redis/redis.service';
import { ZodPipe } from '../../platform/http/zod.pipe';
import { TransactionService } from '../../platform/transaction/transaction.service';
import { clientIp, userAgentOf } from '../access/request-context';
import { Public } from '../access/decorators';
import { OrganizationService } from '../organization/organization.service';
import { SettingsReader } from '../settings/settings-reader';

const contactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  message: z.string().trim().min(10).max(4000),
  /** Honeypot: real people leave it empty */
  company_website: z.string().max(0).optional().default(''),
  /** The form's open time, to refuse instant submissions */
  openedAt: z.number().int().optional(),
});

/** The landing page's contact form: rate limited per address, a honeypot, an email to support and an audit row. Nothing else is stored. */
@Controller('public')
export class PublicController {
  constructor(
    private readonly organizations: OrganizationService,
    private readonly settings: SettingsReader,
    private readonly redis: RedisService,
    private readonly queue: QueueService,
    private readonly transactions: TransactionService,
  ) {}

  @Public()
  @Post('contact')
  @HttpCode(202)
  async contact(
    @Req() req: Request,
    @Body(new ZodPipe(contactSchema)) body: z.infer<typeof contactSchema>,
  ) {
    const organizationId = await this.organizations.currentId();
    if (!organizationId) throw new ApiException('not_found', 'Not available');
    const general = await this.settings.read(organizationId, 'general', generalSettingsSchema);
    if (!general.landing.showContactForm || !general.supportEmail)
      throw new ApiException('not_found', 'The contact form is not available');
    if (body.company_website) return { message: 'Thank you.' }; // a bot filled the hidden field; say nothing
    if (body.openedAt && Date.now() - body.openedAt < 3000)
      throw new ApiException('rate_limited', 'Please take a moment and try again.');
    const ip = clientIp(req);
    const key = `contact:${ip}`;
    let count = 0;
    try {
      count = await this.redis.client.incr(key);
      if (count === 1) await this.redis.client.expire(key, 3600);
    } catch {
      throw new ApiException('temporarily_unavailable', 'Try again in a moment.');
    }
    if (count > 5)
      throw new ApiException(
        'rate_limited',
        'Too many messages from this address. Try again later.',
      );
    await this.queue.sendEmail(organizationId, general.supportEmail, {
      name: 'contact-message',
      params: {
        appName: general.appName,
        name: body.name,
        email: body.email,
        message: body.message,
      },
    });
    await this.transactions.run(
      { organizationId, actorId: null, ip, userAgent: userAgentOf(req) },
      ({ audit }) =>
        audit({
          action: 'public.contact.submitted',
          entityType: 'contact',
          entityId: null,
          changes: { from: body.email },
        }),
    );
    return { message: 'Thank you. We will reply by email.' };
  }
}
