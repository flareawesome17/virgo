import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

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
  ): Promise<void> {
    await this.db.query(
      `insert into push_tokens (user_id, token, platform)
       values ($1, $2, $3)
       on conflict (token) do update
         set user_id = excluded.user_id,
             platform = excluded.platform,
             disabled_at = null`,
      [userId, token, platform],
    );
  }

  async removeToken(userId: string, token: string): Promise<void> {
    await this.db.query(
      'delete from push_tokens where user_id = $1 and token = $2',
      [userId, token],
    );
  }

  /** Active tokens for a user. */
  async tokensFor(userId: string): Promise<string[]> {
    const rows = await this.db.query<{ token: string }>(
      'select token from push_tokens where user_id = $1 and disabled_at is null',
      [userId],
    );
    return rows.map((r) => r.token);
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
