import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { MailConfig } from './mail.config';
import type { RenderedEmail } from './mail.templates';

/**
 * Sending mail.
 *
 * Every send is best-effort and never throws at the caller. A password reset
 * that returns 500 because the mail provider hiccuped tells an attacker the
 * address exists, and tells the user their account is broken when it is not.
 * Failures are logged; the caller's own response says only that the request
 * was accepted.
 */
@Injectable()
export class MailService implements OnModuleDestroy {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;

  constructor(private readonly config: MailConfig) {
    this.transporter = config.isConfigured
      ? createTransport({
          host: config.host,
          port: config.port,
          secure: config.secure,
          auth: { user: config.user, pass: config.password },
          // One connection reused across sends rather than a handshake per
          // message; SMTP2GO throttles connections, not messages.
          pool: true,
          maxConnections: 3,
          maxMessages: 50,
          connectionTimeout: 15_000,
          greetingTimeout: 10_000,
          socketTimeout: 20_000,
        })
      : null;
  }

  onModuleDestroy(): void {
    this.transporter?.close();
  }

  get isEnabled(): boolean {
    return this.transporter !== null;
  }

  /**
   * Sends one message. Resolves false rather than throwing when it could not
   * be sent, so callers can log without having to catch.
   */
  async send(to: string, email: RenderedEmail): Promise<boolean> {
    if (!this.transporter) {
      // Loud enough to notice in development, where this is usually just an
      // unset key rather than a fault.
      this.logger.warn(`Email not sent to ${to}: SMTP is not configured`);
      return false;
    }

    try {
      const info = await this.transporter.sendMail({
        from: this.config.from,
        replyTo: this.config.replyTo,
        to,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });
      this.logger.log(`Sent "${email.subject}" to ${to} (${info.messageId})`);
      return true;
    } catch (err) {
      this.logger.error(`Failed to send "${email.subject}" to ${to}: ${String(err)}`);
      return false;
    }
  }

  /**
   * Checks the credentials and the route to the server.
   *
   * Used by the health endpoint, so a misconfiguration surfaces before a user
   * hits it rather than as a silent non-delivery.
   */
  async verifyConnection(): Promise<{ ok: boolean; detail: string }> {
    if (!this.transporter) {
      return { ok: false, detail: 'SMTP is not configured' };
    }
    try {
      await this.transporter.verify();
      return { ok: true, detail: `${this.config.host}:${this.config.port}` };
    } catch (err) {
      return { ok: false, detail: String(err) };
    }
  }
}
