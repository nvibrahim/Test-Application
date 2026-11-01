import type { Job } from 'bullmq';
import type { PrismaClient } from '../generated/prisma/client';
import type { Env } from '../platform/config/config';
import type { EmailJob } from '../platform/jobs/email-queue';
import type { Logger } from '../platform/logging/logger';
import { resolveSmtp } from '../platform/mail/mail-settings';
import { transportFor } from '../platform/mail/mail.service';
import { renderEmail } from '../platform/mail/templates';

/** Sends one queued email through the organization's mail settings and records the outcome. */
export function emailProcessor(env: Env, prisma: PrismaClient, logger: Logger) {
  return async (job: Job<EmailJob>): Promise<void> => {
    const { emailLogId, organizationId, to, template } = job.data;
    const rendered = renderEmail(template);
    try {
      const settings = await resolveSmtp(prisma, env, organizationId);
      await transportFor(settings).sendMail({
        from: settings.from,
        replyTo: settings.replyTo,
        to,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
      });
      await prisma.emailLog.update({
        where: { id: emailLogId },
        data: { status: 'sent', sentAt: new Date(), error: null },
      });
      logger.info({ emailLogId, template: template.name }, 'email sent');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await prisma.emailLog.update({
        where: { id: emailLogId },
        data: { status: 'failed', error: message },
      });
      throw error; // BullMQ retries with backoff
    }
  };
}
