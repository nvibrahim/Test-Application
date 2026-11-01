import { Inject, Injectable } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import type { Env } from '../config/config';
import { ENV } from '../config/config.module';
import { PrismaService } from '../database/prisma.service';
import { resolveSmtp } from './mail-settings';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface SmtpSettings {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  from: string;
  replyTo?: string;
  requireTls?: boolean;
}

export function transportFor(settings: SmtpSettings): Transporter {
  return nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    auth: settings.user ? { user: settings.user, pass: settings.password ?? '' } : undefined,
    requireTLS: settings.requireTls ?? false,
    connectionTimeout: 10_000,
  });
}

/**
 * Sends through SMTP, from Settings -> Email when a host is saved there, otherwise the
 * environment. Queued mail goes through the worker; this is for the test send and health.
 */
@Injectable()
export class MailService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
  ) {}

  async settingsFor(organizationId: string | null): Promise<SmtpSettings> {
    return resolveSmtp(this.prisma, this.env, organizationId);
  }

  async send(organizationId: string | null, message: MailMessage): Promise<{ messageId: string }> {
    const settings = await this.settingsFor(organizationId);
    const info = await transportFor(settings).sendMail({
      from: settings.from,
      replyTo: settings.replyTo,
      ...message,
    });
    return { messageId: String(info.messageId) };
  }

  /** Health: can the mail server be reached? Never sends anything. */
  async verify(organizationId: string | null = null): Promise<boolean> {
    try {
      await transportFor(await this.settingsFor(organizationId)).verify();
      return true;
    } catch {
      return false;
    }
  }
}
