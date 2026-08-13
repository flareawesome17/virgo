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
   * Which release is running.
   *
   * The value is baked into the image by the release workflow from the GitHub
   * tag it checked out, so it cannot disagree with the code around it. That
   * distinction matters: asking GitHub for "the latest release" at runtime
   * would report a version that may not be deployed yet, and an app that
   * claims to be v1.1.0 while serving v1.0.0 is worse than one that says
   * nothing.
   *
   * Public and unauthenticated on purpose — it is the endpoint the mobile app
   * reads to show the current release, and mobile ships through EAS rather
   * than through the workflow that stamps the images, so this is the only way
   * it can know.
   *
   * `null` rather than a guess when unset: a local or ad-hoc build is not a
   * release, and labelling it with the package.json version would invent one.
   */
  @Public()
  @Get('version')
  version() {
    return {
      version: process.env.APP_VERSION?.trim() || null,
      commit: process.env.APP_COMMIT?.trim()?.slice(0, 7) || null,
    };
  }

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
   * Liveness: is this process able to answer at all?
   *
   * Deliberately touches nothing. A liveness probe that checks the database
   * restarts the API when Postgres is the thing that is down — which loses the
   * one process that could have served cached reads or a useful error, and
   * turns a database blip into a restart loop. Readiness is where dependencies
   * belong.
   */
  @Public()
  @Get('health/live')
  live() {
    return { status: 'ok' };
  }

  /**
   * Readiness: can this instance serve traffic right now?
   *
   * Postgres only, because that is the whole of this API's hard runtime
   * dependency — there is no Redis, no queue and no external cache in this
   * stack. Mail and billing have their own endpoints and are deliberately not
   * checked here: both make network calls measured in seconds, and neither
   * stops the app serving requests.
   *
   * Says what is wrong but not where: no host, no connection string, no
   * driver error text. A readiness probe is reachable without credentials.
   */
  @Public()
  @Get('health/ready')
  async ready() {
    const database = await this.db.ping();
    if (!database) {
      throw new ServiceUnavailableException({
        status: 'not-ready',
        database: 'unreachable',
      });
    }
    return { status: 'ready', database: 'ok' };
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
