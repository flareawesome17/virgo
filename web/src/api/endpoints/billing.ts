import { api } from '../client';

export type SubscriptionStatus =
  | 'incomplete'
  | 'incomplete_cancelled'
  | 'active'
  | 'past_due'
  | 'unpaid'
  | 'cancelled';

export interface BillingStatus {
  /** The tier in force right now. */
  plan: string;
  planSince: string | null;
  subscription: {
    id: string;
    planName: string;
    status: SubscriptionStatus;
    /** Centavos. */
    amountMinor: number;
    currency: string;
    /** False when a single month was bought rather than a subscription. */
    renews: boolean;
    currentPeriodEnd: string | null;
    cancelledAt: string | null;
  } | null;
  /** False when the server has no payment keys configured. */
  paymentsEnabled: boolean;
}

export interface StartedCheckout {
  subscriptionId: string;
  status: string;
  /** Where to send the customer to pay. Null if nothing is owed. */
  checkoutUrl: string | null;
  renews: boolean;
}

/**
 * Paid plans, through PayMongo.
 *
 * Nothing here grants anything. Starting a checkout returns a URL to send the
 * customer to; the plan changes only when PayMongo tells the server the money
 * arrived, which is a webhook the client is not part of. So after checkout the
 * right move is to refetch status, not to assume.
 */
export const billingApi = {
  status(): Promise<BillingStatus> {
    return api.get<BillingStatus>('/billing');
  },

  /**
   * Starts a checkout and returns where to send the customer.
   *
   * `platform` decides where PayMongo returns them afterwards — the web app,
   * or a deep link back into the mobile app. It is a name, not a URL: the
   * server owns the destinations, so a caller cannot redirect a payment page
   * anywhere it likes.
   */
  subscribe(plan: string, platform: 'web' | 'mobile' = 'web'): Promise<StartedCheckout> {
    return api.post<StartedCheckout>('/billing/subscribe', {
      body: { plan, platform },
    });
  },

  /**
   * Asks the server to check with PayMongo whether anything this user started
   * has since been paid, and to apply it.
   *
   * Called on the way back from checkout. It does not assert that a payment
   * happened — the server asks PayMongo and believes only PayMongo.
   */
  reconcile(): Promise<{ applied: number; plan: string }> {
    return api.post('/billing/reconcile');
  },

  /** Cancels. Access runs to the end of the period already paid for. */
  cancel(reason?: string): Promise<{ cancelled: true; accessUntil: string | null }> {
    return api.post('/billing/cancel', { body: reason ? { reason } : {} });
  },
};
