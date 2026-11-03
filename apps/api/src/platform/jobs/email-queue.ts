import type { Queue } from 'bullmq';
import type { PrismaClient } from '../../generated/prisma/client';
import type { Tx } from '../database/prisma.service';
import { renderEmail, type EmailTemplate } from '../mail/templates';

export interface EmailJob {
  emailLogId: string;
  organizationId: string;
  to: string;
  template: EmailTemplate;
}

/**
 * Writes the email_log row and adds the job. Shared by the API's QueueService and the worker's
 * scheduled tasks, so every email, wherever it starts, has a row and a retrying job.
 */
export async function enqueueEmail(
  db: PrismaClient | Tx,
  queue: Queue,
  organizationId: string,
  to: string,
  template: EmailTemplate,
): Promise<string> {
  const subject = renderEmail(template).subject;
  const log = await db.emailLog.create({
    data: { organizationId, toAddress: to, template: template.name, subject, status: 'queued' },
  });
  const job: EmailJob = { emailLogId: log.id, organizationId, to, template };
  try {
    const added = await queue.add('send', job, { jobId: log.id });
    await db.emailLog.update({ where: { id: log.id }, data: { jobId: added.id ?? log.id } });
  } catch (error) {
    await db.emailLog.update({
      where: { id: log.id },
      data: { status: 'failed', error: error instanceof Error ? error.message : String(error) },
    });
  }
  return log.id;
}
