import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Outbound email, via SMTP2GO.
 *
 * SMTP rather than their HTTP API: it is the same credentials either way, and
 * SMTP means the provider can be swapped for any other without touching
 * anything but these values.
 */
@Injectable()
export class MailConfig {
  private readonly logger = new Logger(MailConfig.name);

  readonly host: string;
  readonly port: number;
  readonly user: string;
  readonly password: string;
  /** True only on the implicit-TLS ports (465, 8465, 443). */
  readonly secure: boolean;

  readonly fromAddress: string;
  readonly fromName: string;
  readonly replyTo: string;

  /**
   * Where links in emails point: the web app.
   *
   * Its own variable, *not* PUBLIC_APP_URL — that one is client.virgo.ph, the
   * public gallery a photographer sends to a client, and it has no
   * /reset-password to land on. Reusing it silently pointed every reset and
   * verification link at the wrong app.
   */
  readonly appUrl: string;

  /**
   * The public marketing origin — virgo.ph.
   *
   * Distinct from `appUrl` again: a profile and a job post are addressed on the
   * apex, and linking to them through the app host would 308 and, for a
   * signed-out reader, land on a sign-in wall instead of the page.
   */
  readonly siteUrl: string;

  /**
   * The management console — console.virgo.ph.
   *
   * For the emails only staff receive, like a report about an account, whose
   * link has to land on the account page rather than on anything a member
   * can open. The same variable the console's password reset reads.
   */
  readonly consoleUrl: string;

  constructor(private readonly config: ConfigService) {
    this.host = config.get<string>('SMTP_HOST', 'mail-us.smtp2go.com');
    this.port = Number(config.get<string>('SMTP_PORT', '2525'));
    this.user = config.get<string>('SMTP_USER', '');
    this.password = config.get<string>('SMTP_PASSWORD', '');
    // Derived from the port rather than configured separately: getting the two
    // out of step produces a connection that hangs instead of an error.
    this.secure =
      config.get<string>('SMTP_SECURE') === 'true' ||
      [465, 8465, 443].includes(this.port);

    this.fromAddress = config.get<string>('MAIL_FROM_ADDRESS', 'noreply@virgo.ph');
    this.fromName = config.get<string>('MAIL_FROM_NAME', 'Virgo');
    this.replyTo = config.get<string>('MAIL_REPLY_TO', 'support@virgo.ph');

    this.appUrl = (
      config.get<string>('WEB_APP_URL') ?? 'https://web.virgo.ph'
    ).replace(/\/+$/, '');

    this.siteUrl = (
      config.get<string>('PUBLIC_SITE_URL') ?? 'https://virgo.ph'
    ).replace(/\/+$/, '');

    this.consoleUrl = (
      config.get<string>('CONSOLE_URL') ?? 'https://console.virgo.ph'
    ).replace(/\/+$/, '');

    if (!this.isConfigured) {
      this.logger.warn(
        'SMTP_USER / SMTP_PASSWORD are not set — email is disabled. ' +
          'Verification and password-reset requests will succeed but send nothing.',
      );
    }
  }

  get isConfigured(): boolean {
    return !!this.host && !!this.user && !!this.password;
  }

  /** `Virgo <noreply@virgo.ph>` */
  get from(): string {
    return `${this.fromName} <${this.fromAddress}>`;
  }
}
