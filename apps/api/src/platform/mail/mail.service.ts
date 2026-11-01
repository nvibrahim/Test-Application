import { Inject, Injectable } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import type { Env } from '../config/config';
import { ENV } from '../config/config.module';

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
}

export function transportFor(settings: SmtpSettings): Transporter {
  return nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    auth: settings.user ? { user: settings.user, pass: settings.password ?? '' } : undefined,
    connectionTimeout: 10_000,
  });
}

/**
 * Sends through SMTP. Phase 0 reads the settings from the environment; Phase 4 lets
 * Settings -> Email override them per organization. Templates arrive with React Email.
 */
@Injectable()
export class MailService {
  private readonly settings: SmtpSettings;

  constructor(@Inject(ENV) env: Env) {
    this.settings = {
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      user: env.SMTP_USER || undefined,
      password: env.SMTP_PASSWORD || undefined,
      from: env.SMTP_FROM,
    };
  }

  async send(message: MailMessage): Promise<{ messageId: string }> {
    const info = await transportFor(this.settings).sendMail({
      from: this.settings.from,
      ...message,
    });
    return { messageId: String(info.messageId) };
  }

  /** Health: can the mail server be reached? Never sends anything. */
  async verify(): Promise<boolean> {
    try {
      await transportFor(this.settings).verify();
      return true;
    } catch {
      return false;
    }
  }
}
