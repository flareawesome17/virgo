import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { MailConfig } from '../mail/mail.config';
import { NotifyService } from '../notifications/notify.service';
import { planInfo, PURCHASABLE_PLANS, type PlanInfo } from '../quota/quota.config';
import { PayMongoClient, PayMongoError } from './paymongo.client';

/** PayMongo's own vocabulary, stored verbatim. */
export type SubscriptionStatus =
  | 'incomplete'
  | 'incomplete_cancelled'
  | 'active'
  | 'past_due'
  | 'unpaid'
  | 'cancelled';

export interface SubscriptionRow {
  id: string;
  user_id: string;
  provider_id: string;
  plan_name: string;
  status: SubscriptionStatus;
  amount_minor: number;
  currency: string;
  /** 'subscription' auto-renews; 'one_time' is a single month. */
  kind: 'subscription' | 'one_time';
  current_period_end: Date | null;
  cancelled_at: Date | null;
  created_at: Date;
}

/** A subscription still entitled to its plan. */
const ENTITLED: SubscriptionStatus[] = ['active', 'past_due'];

/**
 * Paid plans.
 *
 * PayMongo is the provider — it is the Philippine option, and it settles PHP
 * only, which is why every amount here is in centavos.
 *
 * The shape of a subscription there is: a Plan (created once per tier), a
 * Customer (once per user), and a Subscription joining the two. Creating the
 * subscription returns it as `incomplete` with a setup_intent carrying a URL
 * where the customer enters their card; it becomes `active` when they finish,
 * and PayMongo tells us so by webhook.
 *
 * So nothing here marks an account as paid. The webhook does. A client that
 * lies about having completed checkout gets nothing, and a customer who closes
 * the tab at the wrong moment still gets what they paid for.
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  /** Provider plan ids, resolved once per tier and cached for the process. */
  private readonly planIds = new Map<string, string>();

  constructor(
    private readonly db: DatabaseService,
    private readonly paymongo: PayMongoClient,
    private readonly notifier: NotifyService,
    private readonly mailConfig: MailConfig,
    private readonly config: ConfigService,
  ) {}

  get isConfigured(): boolean {
    return this.paymongo.isConfigured;
  }

  /**
   * Whether this PayMongo account can actually take a subscription.
   *
   * Subscriptions are off until PayMongo support switch them on, and the only
   * honest way to know is to ask. Used by the health endpoint so the answer is
   * a fact about the live account rather than an assumption.
   */
  async capability(): Promise<{
    configured: boolean;
    mode: 'test' | 'live';
    subscriptionsEnabled: boolean;
    detail: string;
  }> {
    const base = {
      configured: this.paymongo.isConfigured,
      mode: this.paymongo.isTestMode ? ('test' as const) : ('live' as const),
    };

    if (!this.paymongo.isConfigured) {
      return { ...base, subscriptionsEnabled: false, detail: 'PAYMONGO_SECRET_KEY is not set' };
    }

    try {
      await this.paymongo.request('GET', '/subscriptions/plans?limit=1');
      return { ...base, subscriptionsEnabled: true, detail: 'Subscriptions are enabled' };
    } catch (err) {
      // PayMongo's own words when it is an account-configuration problem: the
      // real one is "no subscription payment methods are configured for this
      // organization", which is more actionable than anything paraphrased.
      const detail =
        err instanceof PayMongoError && err.isNotEnabled
          ? `${err.message} — contact support@paymongo.com to enable subscriptions on this account`
          : `Could not reach PayMongo: ${(err as Error).message}`;
      return { ...base, subscriptionsEnabled: false, detail };
    }
  }

  /** The name a tier is stored under at PayMongo. Also how it is found again. */
  private providerPlanName(plan: PlanInfo): string {
    // The amount is in the name on purpose: changing the price means a new
    // plan at PayMongo — theirs are immutable — and this is what stops a price
    // change from silently reusing the plan at the old amount.
    return `Virgo ${plan.label} (${plan.currency} ${plan.priceMinor})`;
  }

  /**
   * The provider's id for a tier, creating the plan the first time.
   *
   * Matched by name against what already exists before creating, because
   * PayMongo will happily hold two plans with the same name and price, and a
   * redeploy — or a second instance booting — would otherwise make one every
   * time.
   */
  private async providerPlanId(plan: PlanInfo): Promise<string> {
    const cached = this.planIds.get(plan.name);
    if (cached) return cached;

    const wanted = this.providerPlanName(plan);

    const existing = await this.paymongo.list<{
      name: string;
      amount: number;
      status?: string;
    }>('/subscriptions/plans?limit=100');

    const match = existing.find(
      (row) =>
        row.attributes.name === wanted &&
        row.attributes.amount === plan.priceMinor &&
        row.attributes.status !== 'archived',
    );
    if (match) {
      this.planIds.set(plan.name, match.id);
      return match.id;
    }

    const created = await this.paymongo.request<{ name: string }>(
      'POST',
      '/subscriptions/plans',
      {
        name: wanted,
        description: `Virgo ${plan.label} — billed monthly`,
        amount: plan.priceMinor,
        currency: plan.currency,
        interval: 'monthly',
        interval_count: 1,
      },
    );

    this.planIds.set(plan.name, created.id);
    this.logger.log(`Created PayMongo plan ${created.id} for ${plan.name}`);
    return created.id;
  }

  /** The user's PayMongo customer, created once and reused. */
  private async providerCustomerId(userId: string): Promise<string> {
    const user = await this.db.queryOne<{
      email: string;
      display_name: string | null;
      phone: string | null;
      paymongo_customer_id: string | null;
    }>(
      `select email, display_name, phone, paymongo_customer_id
         from users where id = $1`,
      [userId],
    );
    if (!user) throw new NotFoundException('Account not found');
    if (user.paymongo_customer_id) return user.paymongo_customer_id;

    const name = (user.display_name ?? user.email.split('@')[0]).trim();
    const [first, ...rest] = name.split(/\s+/);

    const customer = await this.paymongo.request<{ email: string }>(
      'POST',
      '/customers',
      {
        first_name: first || 'Virgo',
        last_name: rest.join(' ') || 'Member',
        email: user.email,
        // PayMongo requires a phone; theirs if we have it, a placeholder in
        // their national format otherwise. It is not used to contact anyone.
        phone: user.phone?.replace(/\s+/g, '') || '+639000000000',
        default_device: 'phone',
      },
    );

    await this.db.query(
      'update users set paymongo_customer_id = $2, updated_at = now() where id = $1',
      [userId, customer.id],
    );
    return customer.id;
  }

  /**
   * Starts a subscription, returning where to send the customer to pay.
   *
   * The returned URL is PayMongo's — the card never touches this server, which
   * is the entire reason for doing it this way rather than taking card details
   * ourselves.
   */
  async subscribe(
    userId: string,
    planName: string,
  ): Promise<{
    subscriptionId: string;
    status: string;
    checkoutUrl: string | null;
    /** False when this bought a single month rather than a subscription. */
    renews: boolean;
  }> {
    if (!this.paymongo.isConfigured) {
      throw new ServiceUnavailableException(
        'Payments are not configured on this server.',
      );
    }

    const plan = planInfo(planName);
    if (!plan || plan.comingSoon || plan.priceMinor <= 0) {
      throw new BadRequestException(
        `Choose one of: ${PURCHASABLE_PLANS.map((p) => p.name).join(', ')}`,
      );
    }

    const live = await this.liveSubscription(userId);
    if (live && live.plan_name === planName) {
      throw new ConflictException(`You are already on ${plan.label}.`);
    }
    if (live) {
      throw new ConflictException(
        'Cancel your current plan before starting a different one.',
      );
    }

    try {
      return await this.subscribeRecurring(userId, plan);
    } catch (err) {
      if (!(err instanceof PayMongoError) || !err.isNotEnabled) throw err;

      // Subscriptions are switched on by PayMongo support, per account. Until
      // that happens the recurring endpoints 404, and refusing to sell
      // anything would be the wrong answer — so the customer buys a month at a
      // time instead. The moment PayMongo enables it, the branch above starts
      // succeeding and new customers auto-renew with no code change.
      this.logger.warn(
        'Subscriptions are not enabled on this PayMongo account; falling back to a one-month checkout',
      );
      return this.subscribeOneMonth(userId, plan);
    }
  }

  /** The real thing: an auto-renewing PayMongo subscription. */
  private async subscribeRecurring(
    userId: string,
    plan: PlanInfo,
  ): Promise<{
    subscriptionId: string;
    status: string;
    checkoutUrl: string | null;
    renews: boolean;
  }> {
    const [planId, customerId] = await Promise.all([
      this.providerPlanId(plan),
      this.providerCustomerId(userId),
    ]);

    const created = await this.paymongo.request<{
      status: SubscriptionStatus;
      setup_intent?: { next_action?: { redirect?: { url?: string } } };
    }>('POST', '/subscriptions', { customer_id: customerId, plan_id: planId });

    await this.record(
      userId,
      created.id,
      plan,
      created.attributes.status,
      'subscription',
      null,
    );

    return {
      subscriptionId: created.id,
      status: created.attributes.status,
      // Where the customer enters their card. Absent only if PayMongo
      // considers the subscription already payable.
      checkoutUrl:
        created.attributes.setup_intent?.next_action?.redirect?.url ?? null,
      renews: true,
    };
  }

  /**
   * One month, bought through a hosted Checkout Session.
   *
   * Nothing is granted here either — `checkout_session.payment.paid` is what
   * grants it, and the metadata is how that webhook knows who paid for what.
   */
  private async subscribeOneMonth(
    userId: string,
    plan: PlanInfo,
  ): Promise<{
    subscriptionId: string;
    status: string;
    checkoutUrl: string | null;
    renews: boolean;
  }> {
    const appUrl = this.mailConfig.appUrl;

    const session = await this.paymongo.request<{
      checkout_url: string;
    }>('POST', '/v2/checkout_sessions', {
      line_items: [
        {
          name: `Virgo ${plan.label} — 1 month`,
          amount: plan.priceMinor,
          currency: plan.currency,
          quantity: 1,
        },
      ],
      payment_method_types: ['card', 'gcash', 'paymaya', 'grab_pay'],
      success_url: `${appUrl}/settings/plans?paid=1`,
      cancel_url: `${appUrl}/settings/plans`,
      description: `Virgo ${plan.label}, one month`,
      send_email_receipt: true,
      // Comes back on the webhook. Without it the payment cannot be tied to an
      // account — PayMongo knows a card was charged, not who to upgrade.
      metadata: { user_id: userId, plan: plan.name },
    });

    await this.record(
      userId,
      session.id,
      plan,
      'incomplete',
      'one_time',
      null,
    );

    return {
      subscriptionId: session.id,
      status: 'incomplete',
      checkoutUrl: session.attributes.checkout_url,
      renews: false,
    };
  }

  private async record(
    userId: string,
    providerId: string,
    plan: PlanInfo,
    status: SubscriptionStatus,
    kind: 'subscription' | 'one_time',
    periodEnd: Date | null,
  ): Promise<void> {
    await this.db.query(
      `insert into subscriptions
         (user_id, provider_id, plan_name, status, amount_minor, currency, kind,
          current_period_end)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (provider_id) do update
         set status = excluded.status,
             -- Coalesced, not overwritten: subscribe() inserts the row with no
             -- period end, and the paid webhook is what fills it in. Taking
             -- excluded.* unconditionally would then wipe it on the next
             -- status update and the plan would look unpaid-for.
             current_period_end =
               coalesce(excluded.current_period_end, subscriptions.current_period_end),
             updated_at = now()`,
      [
        userId,
        providerId,
        plan.name,
        status,
        plan.priceMinor,
        plan.currency,
        kind,
        periodEnd,
      ],
    );
  }

  /** The subscription currently entitling this account to its plan, if any. */
  async liveSubscription(userId: string): Promise<SubscriptionRow | null> {
    return this.db.queryOne<SubscriptionRow>(
      `select * from subscriptions
        where user_id = $1 and status = any($2::text[])
        order by created_at desc limit 1`,
      [userId, ENTITLED],
    );
  }

  /** What the billing screen shows. */
  async status(userId: string): Promise<{
    plan: string;
    planSince: string | null;
    subscription: {
      id: string;
      planName: string;
      status: SubscriptionStatus;
      amountMinor: number;
      currency: string;
      renews: boolean;
      currentPeriodEnd: string | null;
      cancelledAt: string | null;
    } | null;
    paymentsEnabled: boolean;
  }> {
    const user = await this.db.queryOne<{ plan: string; plan_since: Date | null }>(
      'select plan, plan_since from users where id = $1',
      [userId],
    );

    // The most recent one, entitled or not: somebody who just cancelled should
    // still see when their access ends.
    const row = await this.db.queryOne<SubscriptionRow>(
      `select * from subscriptions where user_id = $1
        order by created_at desc limit 1`,
      [userId],
    );

    return {
      plan: user?.plan ?? 'free',
      planSince: user?.plan_since?.toISOString() ?? null,
      subscription: row
        ? {
            id: row.provider_id,
            planName: row.plan_name,
            status: row.status,
            amountMinor: row.amount_minor,
            currency: row.currency,
            // The screen says "renews on" or "ends on" from this.
            renews: row.kind === 'subscription' && !row.cancelled_at,
            currentPeriodEnd: row.current_period_end?.toISOString() ?? null,
            cancelledAt: row.cancelled_at?.toISOString() ?? null,
          }
        : null,
      paymentsEnabled: this.paymongo.isConfigured,
    };
  }

  /**
   * Cancels at PayMongo, then locally.
   *
   * The plan is *not* dropped to free here. They have paid to the end of the
   * period, and taking the storage away the moment they cancel would be theft
   * of the part they already bought. The scheduled sweep drops it when the
   * period actually ends.
   */
  async cancel(
    userId: string,
    reason?: string,
  ): Promise<{ cancelled: true; accessUntil: string | null }> {
    const live = await this.liveSubscription(userId);
    if (!live) throw new NotFoundException('You do not have a plan to cancel.');

    // A one-off month has nothing at PayMongo to cancel — it was paid for and
    // will simply not repeat. Calling their cancel endpoint with a checkout
    // session id would 404.
    if (live.kind === 'subscription') {
      await this.paymongo.request(
        'POST',
        `/subscriptions/${live.provider_id}/cancel`,
        {
          // Their enum; anything else is rejected.
          cancellation_reason: [
            'too_expensive',
            'missing_features',
            'switched_service',
            'unused',
            'other',
          ].includes(reason ?? '')
            ? reason
            : 'other',
        },
      );
    }

    await this.db.query(
      `update subscriptions
          set status = 'cancelled', cancelled_at = now(), updated_at = now()
        where id = $1`,
      [live.id],
    );

    this.logger.log(`Subscription ${live.provider_id} cancelled by ${userId}`);
    return {
      cancelled: true,
      accessUntil: live.current_period_end?.toISOString() ?? null,
    };
  }

  // ─── Applied by the webhook ────────────────────────────────────────────────

  /**
   * Moves an account onto a tier.
   *
   * Only ever called from a verified webhook. Everything else in this class
   * asks PayMongo to do something; this is the one place that decides an
   * account is paid for.
   */
  async applyEntitlement(
    providerId: string,
    status: SubscriptionStatus,
    periodEnd: Date | null,
  ): Promise<void> {
    const row = await this.db.queryOne<SubscriptionRow>(
      `update subscriptions
          set status = $2,
              current_period_end = coalesce($3, current_period_end),
              updated_at = now()
        where provider_id = $1
        returning *`,
      [providerId, status, periodEnd],
    );
    if (!row) {
      this.logger.warn(`Webhook for unknown subscription ${providerId}`);
      return;
    }

    const entitled = ENTITLED.includes(status);
    const plan = entitled ? row.plan_name : 'free';

    await this.db.query(
      `update users
          set plan = $2,
              plan_since = case when plan <> $2 then now() else plan_since end,
              updated_at = now()
        where id = $1`,
      [row.user_id, plan],
    );

    this.logger.log(
      `${row.user_id} -> ${plan} (subscription ${providerId} is ${status})`,
    );

    await this.announce(row.user_id, status, row.plan_name);
  }

  private async announce(
    userId: string,
    status: SubscriptionStatus,
    planName: string,
  ): Promise<void> {
    const plan = planInfo(planName);
    const label = plan?.label ?? planName;

    const message =
      status === 'active'
        ? { title: `You are on ${label}`, body: 'Your new limits are live.' }
        : status === 'past_due'
          ? {
              title: 'Payment did not go through',
              body: `We could not charge your card for ${label}. Update it to keep your plan.`,
            }
          : status === 'unpaid' || status === 'cancelled'
            ? {
                title: `${label} has ended`,
                body: 'Your account is back on the free plan.',
              }
            : null;

    if (!message) return;

    await this.notifier.notify([userId], {
      topic: 'billing',
      ...message,
      data: { type: 'billing', status },
    });
  }

  /**
   * Drops accounts whose paid period has run out.
   *
   * A safety net, not the mechanism: PayMongo sends a webhook when a
   * subscription ends. But a webhook that never arrives — a deploy at the
   * wrong moment, an outage — would otherwise leave an account on a plan
   * nobody is paying for, indefinitely.
   */
  async expireLapsed(): Promise<number> {
    const rows = await this.db.query<{ user_id: string }>(
      `update users u
          set plan = 'free', updated_at = now()
         from subscriptions s
        where s.user_id = u.id
          and u.plan <> 'free'
          and s.status in ('cancelled', 'unpaid', 'incomplete_cancelled')
          and s.current_period_end is not null
          and s.current_period_end < now()
        returning u.id as user_id`,
      [],
    );
    if (rows.length > 0) {
      this.logger.log(`Expired ${rows.length} lapsed plan(s)`);
    }
    return rows.length;
  }

  /**
   * Grants a month from a paid Checkout Session.
   *
   * The one-off equivalent of applyEntitlement: same rule that only a verified
   * webhook grants anything, different provider object behind it.
   */
  async applyOneTimePayment(
    sessionId: string,
    userId: string,
    planName: string,
  ): Promise<void> {
    const plan = planInfo(planName);
    if (!plan) {
      this.logger.warn(`Paid session ${sessionId} names unknown plan ${planName}`);
      return;
    }

    // Extended from the current end rather than from now, so paying early
    // adds a month instead of throwing away the remainder.
    const existing = await this.liveSubscription(userId);
    const from =
      existing?.current_period_end && existing.current_period_end > new Date()
        ? existing.current_period_end
        : new Date();
    const until = new Date(from);
    until.setMonth(until.getMonth() + 1);

    await this.record(userId, sessionId, plan, 'active', 'one_time', until);

    await this.db.query(
      `update users
          set plan = $2,
              plan_since = case when plan <> $2 then now() else plan_since end,
              updated_at = now()
        where id = $1`,
      [userId, plan.name],
    );

    this.logger.log(
      `${userId} -> ${plan.name} until ${until.toISOString()} (session ${sessionId})`,
    );
    await this.announce(userId, 'active', plan.name);
  }

  /** Records a webhook, returning false if it has already been handled. */
  async recordEvent(
    id: string,
    type: string,
    payload: unknown,
  ): Promise<boolean> {
    const rows = await this.db.query<{ id: string }>(
      `insert into billing_events (id, type, payload) values ($1, $2, $3)
       on conflict (id) do nothing
       returning id`,
      [id, type, JSON.stringify(payload)],
    );
    return rows.length > 0;
  }
}
