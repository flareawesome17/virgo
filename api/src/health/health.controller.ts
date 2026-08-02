import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { BillingService } from '../billing/billing.service';
import { DatabaseService } from '../database/database.service';
import { MailService } from '../mail/mail.service';

@Controller()
export class HealthController {
  constructor(
    private readonly db: DatabaseService,
    private readonly mail: MailService,
    private readonly billing: BillingService,
  ) {}

  /**
   * Actually queries Postgres rather than just returning 200. A health check
   * that cannot fail tells a load balancer nothing.
   *
   * Mail is deliberately not checked here: verifying it opens an SMTP
   * connection, which takes seconds and would make a liveness probe slow and
   * flappy. See /health/mail.
   */
  @Public()
  @Get('health')
  async health() {
    const database = await this.db.ping();
    if (!database) {
      throw new ServiceUnavailableException({
        status: 'degraded',
        database: 'unreachable',
      });
    }
    return { status: 'ok', database: 'ok' };
  }

  /**
   * Whether outbound email is actually usable.
   *
   * Worth its own endpoint because a mail misconfiguration otherwise surfaces
   * only as messages nobody receives — the API returns 202 either way, by
   * design, so that a password-reset request cannot be used to probe which
   * addresses exist.
   *
   * Note this proves the connection and the credentials, not that a message
   * will be accepted: SMTP2GO rejects at send time if the From domain is not
   * on its verified-senders list.
   *
   * Authenticated: the reply names the host and repeats the server's own error
   * text, which is more than an anonymous caller needs.
   */
  @Get('health/mail')
  async mailHealth() {
    const result = await this.mail.verifyConnection();
    return {
      status: result.ok ? 'ok' : 'degraded',
      enabled: this.mail.isEnabled,
      detail: result.detail,
    };
  }

  /**
   * Whether this PayMongo account can actually take a subscription.
   *
   * Subscriptions are off until PayMongo support switch them on, and there is
   * no way to tell from the keys alone — so this asks. Without it, the failure
   * mode is a customer reaching checkout and being told to contact support.
   *
   * Authenticated: it reports the mode the keys are in and repeats PayMongo's
   * error text, neither of which an anonymous caller needs.
   */
  @Get('health/billing')
  async billingHealth() {
    const result = await this.billing.capability();
    return {
      status: result.subscriptionsEnabled ? 'ok' : 'degraded',
      ...result,
    };
  }
}
