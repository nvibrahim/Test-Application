import type { Job } from 'bullmq';
import type { PrismaClient } from '../generated/prisma/client';
import type { Env } from '../platform/config/config';
import type { EmailJob } from '../platform/jobs/queue.service';
import type { Logger } from '../platform/logging/logger';
import { transportFor } from '../platform/mail/mail.service';
import { renderEmail } from '../platform/mail/templates';

/** Sends one queued email and records the outcome on its email_log row. */
export function emailProcessor(env: Env, prisma: PrismaClient, logger: Logger) {
  const transport = transportFor({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    user: env.SMTP_USER || undefined,
    password: env.SMTP_PASSWORD || undefined,
    from: env.SMTP_FROM,
  });
  return async (job: Job<EmailJob>): Promise<void> => {
    const { emailLogId, to, template } = job.data;
    const rendered = renderEmail(template);
    try {
      await transport.sendMail({
        from: env.SMTP_FROM,
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
