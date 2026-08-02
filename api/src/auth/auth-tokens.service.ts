import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export type TokenPurpose = 'verify_email' | 'reset_password';

/** How long each kind of link lasts. */
export const TOKEN_TTL_MS: Record<TokenPurpose, number> = {
  // A day: verification often waits until someone is back at a computer.
  verify_email: 24 * 60 * 60 * 1000,
  // An hour. A reset link is a bearer credential for the whole account, so it
  // should not sit in an inbox for a day.
  reset_password: 60 * 60 * 1000,
};

export interface IssuedToken {
  /** The raw value, which only ever exists in the email. */
  token: string;
  expiresAt: Date;
}

/**
 * Single-use links for verifying an address and resetting a password.
 *
 * Stored hashed, like refresh tokens: a database backup that leaks must not
 * hand over working password-reset links. The raw value exists only in the
 * email we send.
 */
@Injectable()
export class AuthTokensService {
  constructor(private readonly db: DatabaseService) {}

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Issues a token, invalidating any outstanding one for the same purpose.
   *
   * Superseding rather than accumulating: asking for a second reset email
   * should retire the first link, or a stale message in the inbox stays live.
   */
  async issue(userId: string, purpose: TokenPurpose): Promise<IssuedToken> {
    // 32 bytes of CSPRNG, base64url so it survives a URL and a double-click
    // selection without punctuation breaking the copy.
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS[purpose]);

    await this.db.transaction(async (client) => {
      await client.query(
        `update auth_tokens set used_at = now()
          where user_id = $1 and purpose = $2 and used_at is null`,
        [userId, purpose],
      );
      await client.query(
        `insert into auth_tokens (user_id, purpose, token_hash, expires_at)
         values ($1, $2, $3, $4)`,
        [userId, purpose, this.hash(token), expiresAt],
      );
    });

    return { token, expiresAt };
  }

  /**
   * Redeems a token, returning the user it belonged to.
   *
   * Marks it used in the same statement that selects it, so two requests
   * racing the same link cannot both succeed.
   */
  async redeem(token: string, purpose: TokenPurpose): Promise<string | null> {
    const row = await this.db.queryOne<{ user_id: string }>(
      `update auth_tokens set used_at = now()
        where token_hash = $1
          and purpose = $2
          and used_at is null
          and expires_at > now()
        returning user_id`,
      [this.hash(token), purpose],
    );
    return row?.user_id ?? null;
  }

  /**
   * Drops tokens that expired more than a week ago.
   *
   * Not immediately: keeping them briefly is what lets a redeem distinguish
   * "this link already expired" from "this link never existed", and the
   * difference matters when someone writes in confused.
   */
  async purgeExpired(): Promise<number> {
    const rows = await this.db.query<{ id: string }>(
      `delete from auth_tokens
        where expires_at < now() - interval '7 days'
        returning id`,
    );
    return rows.length;
  }
}
