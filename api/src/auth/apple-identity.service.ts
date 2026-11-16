import { createHash, createPublicKey, timingSafeEqual } from 'node:crypto';
import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

/** What an Apple identity token says, once it has been proved to be Apple's. */
export interface AppleIdentity {
  /** Apple's identifier for the person, stable for this app. */
  sub: string;
  /** Null when Apple sent none. A relay address when the person hid theirs. */
  email: string | null;
  /** Whether Apple vouches for the address. */
  emailVerified: boolean;
  /** Whether the address is one of Apple's private relays. */
  privateEmail: boolean;
}

interface AppleKey {
  kty: string;
  kid: string;
  use?: string;
  alg?: string;
  n: string;
  e: string;
}

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_KEYS_URL = 'https://appleid.apple.com/auth/keys';
/** Apple rotates its keys rarely; an hour keeps one sign-in from costing a fetch. */
const KEYS_TTL_MS = 60 * 60_000;
/** The app's own bundle id, which is who an identity token must be made out to. */
const DEFAULT_AUDIENCE = 'com.virgo.app';

/**
 * Proves an identity token came from Apple, for this app, for this sign-in.
 *
 * The phone hands over a token Apple signed. Nothing in it can be believed
 * until four things hold: Apple's key signed it, Apple issued it, it was made
 * out to this app and not some other app the same person uses, and it answers
 * the one-time value this sign-in began with. Skipping the third is the
 * classic mistake: any app could then collect tokens from its own users and
 * sign in here as them.
 *
 * No library beyond what the API already has: Apple publishes its keys as
 * JWKs, Node turns a JWK into a key, and the JWT module verifies with it.
 */
@Injectable()
export class AppleIdentityService {
  private readonly logger = new Logger(AppleIdentityService.name);
  private keys: { at: number; byId: Map<string, string> } | null = null;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /** Who a token may be made out to: this app, and anything else configured. */
  private audiences(): string[] {
    const configured = (this.config.get<string>('APPLE_AUDIENCES') ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    return configured.length > 0 ? configured : [DEFAULT_AUDIENCE];
  }

  /** Apple's signing keys as PEM, by key id. `fresh` skips the cache. */
  private async loadKeys(fresh = false): Promise<Map<string, string>> {
    if (!fresh && this.keys && Date.now() - this.keys.at < KEYS_TTL_MS) {
      return this.keys.byId;
    }
    let body: { keys?: AppleKey[] };
    try {
      const response = await fetch(APPLE_KEYS_URL, {
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(`Apple answered ${response.status}`);
      body = (await response.json()) as { keys?: AppleKey[] };
    } catch (error) {
      // An old set of keys is better than none: Apple keeps a key in service
      // long after it publishes the next.
      if (this.keys) return this.keys.byId;
      this.logger.error(
        `Could not read Apple's signing keys: ${(error as Error).message}`,
      );
      throw new ServiceUnavailableException(
        'Sign in with Apple is not available right now. Try again in a moment.',
      );
    }

    const byId = new Map<string, string>();
    for (const key of body.keys ?? []) {
      if (key.kty !== 'RSA' || !key.kid) continue;
      try {
        const pem = createPublicKey({ key: key as never, format: 'jwk' })
          .export({ type: 'spki', format: 'pem' })
          .toString();
        byId.set(key.kid, pem);
      } catch {
        // A key Node cannot read is a key no token can be checked against.
      }
    }
    this.keys = { at: Date.now(), byId };
    return byId;
  }

  /**
   * The identity in a token, or a 401.
   *
   * `rawNonce` is the one-time value the phone made up for this sign-in. Apple
   * was given its SHA-256 and wrote that into the token, so a token lifted
   * from another sign-in does not answer it.
   */
  async verify(identityToken: string, rawNonce: string): Promise<AppleIdentity> {
    const refused = () =>
      new UnauthorizedException('Apple could not confirm that sign-in. Try again.');

    // The header says which of Apple's keys signed it. Read without trusting
    // anything else in the token.
    let kid: string | undefined;
    try {
      const header = JSON.parse(
        Buffer.from(identityToken.split('.')[0] ?? '', 'base64url').toString('utf8'),
      ) as { kid?: unknown; alg?: unknown };
      if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw refused();
      kid = header.kid;
    } catch {
      throw refused();
    }

    let pem = (await this.loadKeys()).get(kid);
    // A key id not seen before is most likely a key Apple has just begun using.
    if (!pem) pem = (await this.loadKeys(true)).get(kid);
    if (!pem) throw refused();

    let claims: Record<string, unknown>;
    try {
      claims = await this.jwt.verifyAsync<Record<string, unknown>>(identityToken, {
        publicKey: pem,
        algorithms: ['RS256'],
        issuer: APPLE_ISSUER,
        audience: this.audiences() as [string, ...string[]],
      });
    } catch {
      throw refused();
    }

    const expected = createHash('sha256').update(rawNonce).digest('hex');
    const given = typeof claims.nonce === 'string' ? claims.nonce : '';
    const a = Buffer.from(expected);
    const b = Buffer.from(given);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw refused();

    if (typeof claims.sub !== 'string' || claims.sub.length === 0) throw refused();

    // Apple sends these two as booleans or as the strings "true" and "false".
    const yes = (value: unknown) => value === true || value === 'true';
    const email =
      typeof claims.email === 'string' && claims.email.includes('@')
        ? claims.email.trim().toLowerCase()
        : null;
    return {
      sub: claims.sub,
      email,
      emailVerified: email !== null && yes(claims.email_verified),
      privateEmail: yes(claims.is_private_email),
    };
  }
}
