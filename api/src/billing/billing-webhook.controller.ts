import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../auth/public.decorator';
import { BillingService, type SubscriptionStatus } from './billing.service';
import { PayMongoClient } from './paymongo.client';

/** How long a signed timestamp stays acceptable. */
const TOLERANCE_SECONDS = 300;

/**
 * Where PayMongo tells us what happened.
 *
 * This is the only thing in the app that decides an account is paid for.
 * Nothing the client says can grant a plan — a browser can be made to claim
 * anything, and "I completed checkout" is exactly the claim worth faking.
 *
 * Public, because PayMongo has no session. The signature is the authentication,
 * and the endpoint does nothing at all before checking it.
 */
@Public()
@SkipThrottle()
@Controller('billing/webhook')
export class BillingWebhookController {
  private readonly logger = new Logger(BillingWebhookController.name);
  private readonly secret: string;

  constructor(
    private readonly billing: BillingService,
    private readonly paymongo: PayMongoClient,
    config: ConfigService,
  ) {
    this.secret = config.get<string>('PAYMONGO_WEBHOOK_SECRET', '');
  }

  /**
   * Checks the signature.
   *
   * The header is `t=<unix>,te=<test sig>,li=<live sig>`, and the signed
   * string is `${t}.${rawBody}` under HMAC-SHA256 with the webhook secret.
   * Which of te/li to compare depends on the mode the keys are in.
   *
   * The timestamp is checked too: without it, a signature stays valid forever
   * and anyone who captures one request can replay it indefinitely.
   */
  private verify(header: string | undefined, raw: Buffer): void {
    if (!this.secret) {
      throw new UnauthorizedException('PAYMONGO_WEBHOOK_SECRET is not set');
    }
    if (!header) throw new UnauthorizedException('Missing Paymongo-Signature');

    const parts = new Map(
      header.split(',').map((piece) => {
        const [key, ...rest] = piece.trim().split('=');
        return [key, rest.join('=')] as const;
      }),
    );

    const timestamp = parts.get('t');
    const signature = parts.get(this.paymongo.isTestMode ? 'te' : 'li');
    if (!timestamp || !signature) {
      throw new UnauthorizedException('Malformed Paymongo-Signature');
    }

    const age = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (!Number.isFinite(age) || age > TOLERANCE_SECONDS) {
      throw new UnauthorizedException('Signature timestamp is out of range');
    }

    const expected = createHmac('sha256', this.secret)
      .update(`${timestamp}.${raw.toString('utf8')}`)
      .digest('hex');

    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(signature, 'utf8');
    // Length is checked first because timingSafeEqual throws on a mismatch,
    // and a thrown error is itself a timing signal.
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Bad signature');
    }
  }

  @HttpCode(200)
  @Post()
  async handle(
    @Req() req: RawBodyRequest<Request>,
    @Headers('paymongo-signature') signature?: string,
  ): Promise<{ received: true }> {
    const raw = req.rawBody;
    if (!raw) throw new BadRequestException('Missing raw body');

    this.verify(signature, raw);

    const event = JSON.parse(raw.toString('utf8')) as {
      data?: {
        id?: string;
        attributes?: {
          type?: string;
          data?: {
            id?: string;
            attributes?: {
              status?: SubscriptionStatus;
              next_billing_schedule?: string;
              subscription_id?: string;
              period_end?: string;
              /** Set on a Checkout Session; tells us who paid for what. */
              metadata?: { user_id?: string; plan?: string };
            };
          };
        };
      };
    };

    const eventId = event.data?.id;
    const type = event.data?.attributes?.type;
    if (!eventId || !type) throw new BadRequestException('Unrecognised event');

    // Providers retry until they get a 2xx. Handling "invoice paid" twice
    // would extend the period twice, so a replay stops here.
    const fresh = await this.billing.recordEvent(eventId, type, event);
    if (!fresh) {
      this.logger.log(`Ignoring replayed ${type} (${eventId})`);
      return { received: true };
    }

    const resource = event.data?.attributes?.data;
    const attributes = resource?.attributes;

    // The subscription id is on the resource itself for subscription events,
    // and on the invoice for invoice events.
    const subscriptionId = attributes?.subscription_id ?? resource?.id;

    try {
      switch (type) {
        case 'subscription.activated':
          await this.apply(subscriptionId, 'active', attributes?.next_billing_schedule);
          break;
        case 'subscription.past_due':
          await this.apply(subscriptionId, 'past_due', attributes?.next_billing_schedule);
          break;
        case 'subscription.unpaid':
          await this.apply(subscriptionId, 'unpaid', undefined);
          break;
        case 'subscription.updated':
          if (attributes?.status) {
            await this.apply(
              subscriptionId,
              attributes.status,
              attributes.next_billing_schedule,
            );
          }
          break;
        // A paid invoice is what actually extends the period.
        case 'subscription.invoice.paid':
          await this.apply(
            subscriptionId,
            'active',
            attributes?.period_end ?? attributes?.next_billing_schedule,
          );
          break;
        case 'subscription.invoice.payment_failed':
          await this.apply(subscriptionId, 'past_due', undefined);
          break;

        // The one-off path, used while subscriptions are not enabled on the
        // account. The metadata is the only link back to an account — PayMongo
        // knows a card was charged, not who to upgrade.
        case 'checkout_session.payment.paid': {
          const meta = attributes?.metadata;
          if (!resource?.id || !meta?.user_id || !meta?.plan) {
            this.logger.warn(
              `Paid checkout ${resource?.id ?? '?'} carried no usable metadata`,
            );
            break;
          }
          await this.billing.applyOneTimePayment(
            resource.id,
            meta.user_id,
            meta.plan,
          );
          break;
        }
        default:
          this.logger.log(`No handler for ${type}; recorded and ignored`);
      }
    } catch (err) {
      // Logged and swallowed: a 500 makes PayMongo retry, and the event is
      // already recorded, so the retry would be skipped as a replay and the
      // work lost either way. Better to keep the 200 and have the record.
      this.logger.error(`Handling ${type} (${eventId}) failed: ${String(err)}`);
    }

    return { received: true };
  }

  private async apply(
    subscriptionId: string | undefined,
    status: SubscriptionStatus,
    periodEnd: string | undefined,
  ): Promise<void> {
    if (!subscriptionId) {
      this.logger.warn(`Event carried no subscription id; nothing to apply`);
      return;
    }
    const end = periodEnd ? new Date(periodEnd) : null;
    await this.billing.applyEntitlement(
      subscriptionId,
      status,
      end && !Number.isNaN(end.getTime()) ? end : null,
    );
  }
}
