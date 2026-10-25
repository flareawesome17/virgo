import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { SessionClient } from './device-label';

/** One signed-in device: a family of rotated refresh tokens. */
export interface SessionRow {
  family_id: string;
  signed_in_at: Date;
  last_active_at: Date;
  user_agent: string | null;
  client: SessionClient | null;
}

/** What a sign-in alert's link is about. */
export interface SignInAlertRow {
  id: string;
  user_id: string;
  family_id: string;
  created_at: Date;
  used_at: Date | null;
}

/**
 * Sessions as their owner sees them, and the alerts sent about new ones.
 *
 * Kept apart from UsersRepository, which issues and rotates the tokens: this
 * only reads them by device and ends them.
 */
@Injectable()
export class SessionsRepository {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Where the account is signed in, most recently active first.
   *
   * The console's query (AdminCustomersService.devices), plus the client. A
   * device is live while one token in its family is unrevoked and unexpired;
   * a token from before families existed counts as its own device. "Last
   * active" is its newest token, which a client in use replaces every 15
   * minutes.
   */
  async listLive(userId: string): Promise<SessionRow[]> {
    return this.db.query<SessionRow>(
      `select coalesce(t.family_id, t.id) as family_id,
              min(t.created_at) as signed_in_at,
              max(t.created_at) as last_active_at,
              (array_agg(t.user_agent order by t.created_at desc)
                 filter (where t.user_agent is not null))[1] as user_agent,
              (array_agg(t.client order by t.created_at desc)
                 filter (where t.client is not null))[1] as client
         from refresh_tokens t
        where t.user_id = $1
        group by coalesce(t.family_id, t.id)
       having bool_or(t.revoked_at is null and t.expires_at > now())
        order by max(t.created_at) desc
        limit 50`,
      [userId],
    );
  }

  /** Whether the account has signed in anywhere before this device. */
  async hasOtherSessions(userId: string, familyId: string): Promise<boolean> {
    const row = await this.db.queryOne<{ any: boolean }>(
      `select exists (
         select 1 from refresh_tokens
          where user_id = $1 and coalesce(family_id, id) <> $2::uuid
       ) as any`,
      [userId, familyId],
    );
    return row?.any ?? false;
  }

  /**
   * Ends one device's session; how many of its tokens that took.
   *
   * Scoped to the owner, so an id from somebody else's account ends nothing.
   * Its access token runs out within 15 minutes, as it does after a sign-out.
   * Expired tokens are left alone: they end nothing, and counting them would
   * call a device that was already gone "signed out".
   */
  async revoke(userId: string, familyId: string): Promise<number> {
    const rows = await this.db.query<{ id: string }>(
      `update refresh_tokens set revoked_at = now()
        where user_id = $1 and coalesce(family_id, id) = $2::uuid
          and revoked_at is null and expires_at > now()
        returning id`,
      [userId, familyId],
    );
    return rows.length;
  }

  /** Every live device but this one; how many devices that was. */
  async revokeAllExcept(userId: string, keepFamilyId: string): Promise<number> {
    const rows = await this.db.query<{ family: string }>(
      `update refresh_tokens set revoked_at = now()
        where user_id = $1 and coalesce(family_id, id) <> $2::uuid
          and revoked_at is null and expires_at > now()
        returning coalesce(family_id, id) as family`,
      [userId, keepFamilyId],
    );
    return new Set(rows.map((r) => r.family)).size;
  }

  /** The one device a family is, for the alert email and its link's page. */
  async findSession(userId: string, familyId: string): Promise<SessionRow | null> {
    return this.db.queryOne<SessionRow>(
      `select coalesce(t.family_id, t.id) as family_id,
              min(t.created_at) as signed_in_at,
              max(t.created_at) as last_active_at,
              (array_agg(t.user_agent order by t.created_at desc)
                 filter (where t.user_agent is not null))[1] as user_agent,
              (array_agg(t.client order by t.created_at desc)
                 filter (where t.client is not null))[1] as client
         from refresh_tokens t
        where t.user_id = $1 and coalesce(t.family_id, t.id) = $2::uuid
        group by coalesce(t.family_id, t.id)`,
      [userId, familyId],
    );
  }

  /** Whether any token in the family can still be refreshed. */
  async isLive(userId: string, familyId: string): Promise<boolean> {
    const row = await this.db.queryOne<{ live: boolean }>(
      `select exists (
         select 1 from refresh_tokens
          where user_id = $1 and coalesce(family_id, id) = $2::uuid
            and revoked_at is null and expires_at > now()
       ) as live`,
      [userId, familyId],
    );
    return row?.live ?? false;
  }

  async createAlert(
    userId: string,
    familyId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.db.query(
      `insert into sign_in_alerts (user_id, family_id, token_hash, expires_at)
       values ($1, $2, $3, $4)`,
      [userId, familyId, tokenHash, expiresAt],
    );
  }

  /** The alert behind a link, while the link still works. */
  async findAlert(tokenHash: string): Promise<SignInAlertRow | null> {
    return this.db.queryOne<SignInAlertRow>(
      `select id, user_id, family_id, created_at, used_at from sign_in_alerts
        where token_hash = $1 and expires_at > now()`,
      [tokenHash],
    );
  }

  /** Marks the link used; false when another click got there first. */
  async useAlert(id: string): Promise<boolean> {
    const rows = await this.db.query<{ id: string }>(
      `update sign_in_alerts set used_at = now()
        where id = $1 and used_at is null
        returning id`,
      [id],
    );
    return rows.length > 0;
  }
}
