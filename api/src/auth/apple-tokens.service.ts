import { createPrivateKey, sign, type KeyObject } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke';
/** Who a client secret is made out to. */
const APPLE_AUDIENCE = 'https://appleid.apple.com';
/** The app's bundle id: the codes the iPhone app gets are made out to it. */
const DEFAULT_CLIENT_ID = 'com.virgo.app';
/** A client secret is used once, straight away. Apple allows up to six months. */
const SECRET_TTL_S = 5 * 60;

/** What happened to an account's Apple sign-in when the account went. */
export type AppleRevokeOutcome = 'revoked' | 'not-configured' | 'failed';

interface AppleKeySettings {
  teamId: string;
  keyId: string;
  clientId: string;
  key: KeyObject;
}

/**
 * The private key as PEM, from however it was put in the environment: the
 * .p8 file's text, with real line breaks or with `\n` written out, or only
 * the base64 between its BEGIN and END lines, joined onto one line.
 */
export function appleKeyPem(raw: string): string {
  const text = raw
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/\\n/g, '\n')
    .trim();
  if (text.includes('-----BEGIN')) return `${text}\n`;
  const body = text.replace(/\s+/g, '');
  const lines = body.match(/.{1,64}/g) ?? [];
  return `-----BEGIN PRIVATE KEY-----\n${lines.join('\n')}\n-----END PRIVATE KEY-----\n`;
}

function base64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

/**
 * Ends an account's Sign in with Apple when the account is deleted.
 *
 * Apple's rule for apps that offer Sign in with Apple: deleting the account
 * must also revoke the person's Apple tokens, so the app drops off "Sign in
 * with Apple" in their Apple ID and a later sign-in starts from scratch.
 *
 * Revoking needs one of the person's tokens, and the server keeps none: a
 * sign-in only proves an identity token, which cannot be revoked. So deleting
 * asks Apple again, on the phone, and the sheet hands back a one-time code
 * (good for five minutes). This trades that code for a refresh token and
 * revokes it at once.
 *
 * Talking to Apple's token endpoint takes a client secret: a short JWT signed
 * with a Sign in with Apple key from the Apple developer account. Without that
 * key configured, nothing is revoked and the deletion goes ahead regardless —
 * a missing key or an Apple outage must never keep somebody's account alive.
 *
 *   APPLE_TEAM_ID        the developer team, e.g. 82TSNQVM65
 *   APPLE_SIGNIN_KEY_ID  the key's id, shown beside it in the developer account
 *   APPLE_SIGNIN_KEY     the .p8 file's contents (see appleKeyPem)
 *   APPLE_CLIENT_ID      optional; the bundle id, com.virgo.app
 */
@Injectable()
export class AppleTokensService {
  private readonly logger = new Logger(AppleTokensService.name);
  private cached: { raw: string; key: KeyObject } | null = null;

  constructor(private readonly config: ConfigService) {}

  private settings(): AppleKeySettings | null {
    const read = (name: string) => (this.config.get<string>(name) ?? '').trim();
    const teamId = read('APPLE_TEAM_ID');
    const keyId = read('APPLE_SIGNIN_KEY_ID');
    const raw = read('APPLE_SIGNIN_KEY');
    if (!teamId || !keyId || !raw) return null;
    if (this.cached?.raw !== raw) {
      this.cached = { raw, key: createPrivateKey(appleKeyPem(raw)) };
    }
    return { teamId, keyId, clientId: read('APPLE_CLIENT_ID') || DEFAULT_CLIENT_ID, key: this.cached.key };
  }

  /** The JWT that stands for this app at Apple's token endpoints. ES256. */
  clientSecret(settings: AppleKeySettings, now = Date.now()): string {
    const iat = Math.floor(now / 1000);
    const input = `${base64url({ alg: 'ES256', kid: settings.keyId })}.${base64url({
      iss: settings.teamId,
      iat,
      exp: iat + SECRET_TTL_S,
      aud: APPLE_AUDIENCE,
      sub: settings.clientId,
    })}`;
    // JOSE wants the signature as r and s side by side, not DER.
    const signature = sign('sha256', Buffer.from(input), {
      key: settings.key,
      dsaEncoding: 'ieee-p1363',
    });
    return `${input}.${signature.toString('base64url')}`;
  }

  private async post(url: string, form: Record<string, string>): Promise<Response> {
    return fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
      signal: AbortSignal.timeout(8000),
    });
  }

  /** Apple's own word for a refusal, which says nothing secret. */
  private async reason(response: Response): Promise<string> {
    try {
      const body = (await response.json()) as { error?: unknown };
      if (typeof body.error === 'string') return `${response.status} ${body.error}`;
    } catch {
      // Not JSON: the status is all there is.
    }
    return String(response.status);
  }

  /**
   * Trades the code from Apple's sheet for a token and revokes it. Never
   * throws: what happened comes back, and a failure is logged.
   */
  async revokeWithCode(code: string, userId: string): Promise<AppleRevokeOutcome> {
    let settings: AppleKeySettings | null;
    try {
      settings = this.settings();
    } catch (error) {
      this.logger.error(
        `Apple sign-in not revoked for ${userId}: APPLE_SIGNIN_KEY could not be read (${(error as Error).message})`,
      );
      return 'failed';
    }
    if (!settings) {
      this.logger.warn(
        `Apple sign-in not revoked for ${userId}: no Sign in with Apple key is configured`,
      );
      return 'not-configured';
    }

    try {
      const secret = this.clientSecret(settings);
      const exchanged = await this.post(APPLE_TOKEN_URL, {
        client_id: settings.clientId,
        client_secret: secret,
        code,
        grant_type: 'authorization_code',
      });
      if (!exchanged.ok) {
        throw new Error(`the code exchange answered ${await this.reason(exchanged)}`);
      }
      const tokens = (await exchanged.json()) as {
        refresh_token?: unknown;
        access_token?: unknown;
      };
      const [token, hint] =
        typeof tokens.refresh_token === 'string'
          ? [tokens.refresh_token, 'refresh_token']
          : typeof tokens.access_token === 'string'
            ? [tokens.access_token, 'access_token']
            : [null, null];
      if (!token || !hint) throw new Error('Apple returned no token');

      const revoked = await this.post(APPLE_REVOKE_URL, {
        client_id: settings.clientId,
        client_secret: secret,
        token,
        token_type_hint: hint,
      });
      if (!revoked.ok) {
        throw new Error(`the revoke answered ${await this.reason(revoked)}`);
      }
      this.logger.log(`Apple sign-in revoked for ${userId}`);
      return 'revoked';
    } catch (error) {
      this.logger.error(`Apple sign-in not revoked for ${userId}: ${(error as Error).message}`);
      return 'failed';
    }
  }
}
