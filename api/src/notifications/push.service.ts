import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
// A plain SQL fragment, not the messages module: that module imports this one.
import { unreadMessagesCount } from '../messages/unread-sql';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/** Expo rejects batches larger than this. */
const MAX_BATCH = 100;

export interface PushMessage {
  to: string;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  /** Android channel; must match one created on the device. */
  channelId?: string;
  /**
   * Delivery urgency. 'high' wakes a dozing Android device rather than
   * queueing until its next maintenance window — right for a message, and
   * needlessly rude for anything that can wait.
   */
  priority?: 'default' | 'normal' | 'high';
  /**
   * The number on the app's home-screen icon (iOS). Expo passes it to APNs as
   * `aps.badge`, which sets the icon to exactly this — 0 clears it — and a
   * push without it leaves the icon as it was. Set from badgeCounts, never a
   * guess: the app sets the same total itself while it is open.
   */
  badge?: number;
}

interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

/**
 * Delivery through Expo's push service.
 *
 * Expo is the transport rather than APNs/FCM directly because the client is an
 * Expo app: the device already produces an Expo push token, and using it avoids
 * holding Apple and Google credentials on this server.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Registers a device token against a user.
   *
   * Upserts on the token, not on (user, token): the same physical device can be
   * signed in to a different account later, and the row must move with it or
   * the previous user keeps receiving that device's notifications.
   */
  async registerToken(
    userId: string,
    token: string,
    platform: 'ios' | 'android' | 'web',
    appVersion?: string,
  ): Promise<void> {
    // `coalesce` so a build that sends no version — one from before versions
    // were reported — does not wipe a version a newer build already recorded.
    await this.db.query(
      `insert into push_tokens (user_id, token, platform, app_version)
       values ($1, $2, $3, $4)
       on conflict (token) do update
         set user_id = excluded.user_id,
             platform = excluded.platform,
             app_version = coalesce(excluded.app_version, push_tokens.app_version),
             disabled_at = null`,
      [userId, token, platform, appVersion?.replace(/^v/i, '') ?? null],
    );
  }

  /**
   * The phone holding this token has just scheduled its reminders locally, as
   * far as `coveredUntil` (null: all it was given). See migration 076: the
   * reminder sweep skips its push for what the phone already has.
   */
  async markRemindersSynced(
    userId: string,
    token: string,
    coveredUntil: string | null,
  ): Promise<void> {
    await this.db.query(
      `update push_tokens
          set reminders_synced_at = now(), reminders_covered_until = $3
        where user_id = $1 and token = $2`,
      [userId, token, coveredUntil],
    );
  }

  async removeToken(userId: string, token: string): Promise<void> {
    await this.db.query(
      'delete from push_tokens where user_id = $1 and token = $2',
      [userId, token],
    );
  }

  /**
   * Active tokens for a user. None while the console has them suspended.
   *
   * Decided here, when a push is about to go, rather than by deleting tokens
   * on suspension. The app's own unregister on a forced sign-out is best
   * effort — an offline phone never sends it — so a suspended phone could keep
   * showing message previews on its lock screen;
   * a token it registers again inside its last fifteen minutes still fails
   * this join; and lifting the suspension brings pushes back with no
   * re-registration.
   */
  async tokensFor(userId: string): Promise<string[]> {
    const rows = await this.db.query<{ token: string }>(
      `select t.token
         from push_tokens t
         join users u on u.id = t.user_id
        where t.user_id = $1
          and t.disabled_at is null
          and u.suspended_at is null
          -- Paused: every session was ended and none can start until the date
          -- (account-state.ts), so these would reach a signed-out phone.
          and (u.disabled_until is null or u.disabled_until <= now())`,
      [userId],
    );
    return rows.map((r) => r.token);
  }

  /**
   * What each person's app icon should say: unread notifications plus unread
   * messages — the bell and the Messages count, the two numbers the app
   * itself shows.
   *
   * One query for the whole batch, however many people are in it: the reminder
   * sweep hands NotifyService hundreds at a time. Read after the thing being
   * pushed was stored, so the count includes it — the icon shows what the
   * person will find when they open the app.
   *
   * Update announcements are not counted: which ones somebody sees depends on
   * the platform and version of each device, and this is one number per
   * person. The app adds them back once it is open (mobile app-badge.ts).
   *
   * Users with no row come back absent rather than 0, so a caller can leave
   * the badge off their push rather than clear an icon it knows nothing about.
   */
  async badgeCounts(userIds: readonly string[]): Promise<Map<string, number>> {
    const ids = [...new Set(userIds)];
    if (ids.length === 0) return new Map();
    const rows = await this.db.query<{ user_id: string; badge: number | string }>(
      `select r.id as user_id,
              ((select count(*)
                  from notifications n
                 where n.user_id = r.id and n.read_at is null)
               + ${unreadMessagesCount('r.id')})::int as badge
         from unnest($1::uuid[]) as r(id)`,
      [ids],
    );
    return new Map(rows.map((r) => [r.user_id, Number(r.badge)]));
  }

  private async disableToken(token: string): Promise<void> {
    await this.db.query(
      'update push_tokens set disabled_at = now() where token = $1',
      [token],
    );
  }

  /**
   * Sends messages, returning how many Expo accepted.
   *
   * Tokens Expo reports as unregistered are disabled rather than deleted, so a
   * device that returns keeps its row and history.
   */
  async send(messages: PushMessage[]): Promise<{ sent: number; failed: number }> {
    if (messages.length === 0) return { sent: 0, failed: 0 };

    let sent = 0;
    let failed = 0;

    for (let i = 0; i < messages.length; i += MAX_BATCH) {
      const batch = messages.slice(i, i + MAX_BATCH);

      let tickets: ExpoTicket[];
      try {
        const res = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
          },
          body: JSON.stringify(batch),
        });

        if (!res.ok) {
          // A whole-batch failure is transient (rate limit, outage). Count it
          // and move on; the reminder stays unmarked and retries next sweep.
          this.logger.warn(`Expo push returned ${res.status}`);
          failed += batch.length;
          continue;
        }

        const json = (await res.json()) as { data?: ExpoTicket[] };
        tickets = json.data ?? [];
      } catch (err) {
        this.logger.error(`Expo push request failed: ${String(err)}`);
        failed += batch.length;
        continue;
      }

      for (let t = 0; t < tickets.length; t++) {
        const ticket = tickets[t];
        if (ticket.status === 'ok') {
          sent++;
          continue;
        }
        failed++;
        const target = batch[t]?.to;
        if (ticket.details?.error === 'DeviceNotRegistered' && target) {
          await this.disableToken(target);
          this.logger.log(`Disabled dead push token`);
        } else {
          this.logger.warn(`Push rejected: ${ticket.message ?? 'unknown'}`);
        }
      }
    }

    return { sent, failed };
  }
}
