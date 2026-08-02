import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const HOST = 'https://api.paymongo.com';

/**
 * Paths are given with their version, because PayMongo mixes them: everything
 * here is v1 except Checkout Sessions, which is v2. Baking v1 into the base
 * URL made that impossible to express.
 */
const DEFAULT_VERSION = 'v1';

/** Resolves a path to a full URL, defaulting the version when unversioned. */
function url(path: string): string {
  return /^\/v[12]\//.test(path)
    ? `${HOST}${path}`
    : `${HOST}/${DEFAULT_VERSION}${path}`;
}

/** PayMongo wraps everything in `{ data: { id, type, attributes } }`. */
export interface PayMongoResource<T = Record<string, unknown>> {
  id: string;
  type: string;
  attributes: T;
}

export class PayMongoError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = 'PayMongoError';
  }

  /**
   * Whether the account simply does not have this feature switched on.
   *
   * Subscriptions are off by default and enabled by PayMongo support, so this
   * is the difference between "your integration is broken" and "ring your
   * account manager" — worth telling apart in an error message.
   */
  get isNotEnabled(): boolean {
    return (
      this.status === 403 ||
      this.status === 404 ||
      // The observed one is `payment_method_not_configured` — "no subscription
      // payment methods are configured for this organization".
      /not[_ ](enabled|allowed|permitted|configured)|resource_not_found/i.test(
        `${this.code ?? ''} ${this.detail ?? ''}`,
      )
    );
  }
}

/**
 * Talks to PayMongo.
 *
 * Deliberately thin: it authenticates, sends JSON, and turns their error shape
 * into something with a status on it. No retries — every call this makes either
 * creates money-moving state or reads it, and blindly retrying a create is how
 * you charge somebody twice.
 *
 * The secret key never leaves this class.
 */
@Injectable()
export class PayMongoClient {
  private readonly logger = new Logger(PayMongoClient.name);
  private readonly secretKey: string;

  constructor(config: ConfigService) {
    this.secretKey = config.get<string>('PAYMONGO_SECRET_KEY', '');
  }

  get isConfigured(): boolean {
    return this.secretKey.length > 0;
  }

  /**
   * True when the keys are PayMongo's test keys.
   *
   * Decides which of the two signatures in a webhook header to check, and is
   * worth surfacing on the health endpoint — "billing works" means something
   * different in test mode.
   */
  get isTestMode(): boolean {
    return this.secretKey.startsWith('sk_test');
  }

  private get authHeader(): string {
    // HTTP Basic with the secret key as the username and no password.
    return `Basic ${Buffer.from(`${this.secretKey}:`).toString('base64')}`;
  }

  async request<T = Record<string, unknown>>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    attributes?: Record<string, unknown>,
  ): Promise<PayMongoResource<T>> {
    const body = await this.send<PayMongoResource<T>>(method, path, attributes);
    if (!body.data) throw new PayMongoError('PayMongo returned no data', 200);
    return body.data;
  }

  /**
   * A collection endpoint.
   *
   * Separate from `request` because `data` is an array here and a single
   * object there — one method returning `T | T[]` would push that check onto
   * every caller.
   */
  async list<T = Record<string, unknown>>(
    path: string,
  ): Promise<PayMongoResource<T>[]> {
    const body = await this.send<PayMongoResource<T>[]>('GET', path);
    return body.data ?? [];
  }

  private async send<D>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    attributes?: Record<string, unknown>,
  ): Promise<{ data?: D; errors?: { code?: string; detail?: string }[] }> {
    if (!this.isConfigured) {
      throw new PayMongoError('PAYMONGO_SECRET_KEY is not set', 500);
    }

    let res: Response;
    try {
      res = await fetch(url(path), {
        method,
        headers: {
          authorization: this.authHeader,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: attributes ? JSON.stringify({ data: { attributes } }) : undefined,
      });
    } catch (err) {
      throw new PayMongoError(`Could not reach PayMongo: ${String(err)}`, 503);
    }

    const text = await res.text();
    let body: { data?: D; errors?: { code?: string; detail?: string }[] };
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      throw new PayMongoError(
        `PayMongo returned a non-JSON response (${res.status})`,
        res.status,
      );
    }

    if (!res.ok) {
      const first = body.errors?.[0];
      // Logged without the request body: it can carry a customer's details,
      // and this line ends up in container logs.
      this.logger.warn(
        `PayMongo ${method} ${path} -> ${res.status} ${first?.code ?? ''} ${first?.detail ?? ''}`,
      );
      throw new PayMongoError(
        first?.detail ?? `PayMongo request failed (${res.status})`,
        res.status,
        first?.code,
        first?.detail,
      );
    }

    return body;
  }
}
