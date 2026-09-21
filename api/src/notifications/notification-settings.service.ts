import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  isLocked,
  presentSettings,
  usesChannel,
  type CategorySetting,
  type NotificationCategory,
  type NotificationChannel,
} from './notification-categories';

/**
 * Which kinds of notification reach an account on which channel.
 *
 * Stored as the switches someone actually changed, not a full table: a kind
 * added later is on for everyone, as it would have been, without a migration
 * to write it into every row.
 */
@Injectable()
export class NotificationSettingsService {
  constructor(private readonly db: DatabaseService) {}

  async get(userId: string): Promise<CategorySetting[]> {
    const row = await this.db.queryOne<{ channels: unknown }>(
      'select channels from notification_settings where user_id = $1',
      [userId],
    );
    return presentSettings(row?.channels);
  }

  /**
   * Flips one switch, and answers with the whole table so the screen shows
   * what was saved rather than what it assumed.
   *
   * One statement, merged into whatever is there, so two switches flipped at
   * once from two devices both land instead of the second overwriting the
   * first.
   */
  async set(
    userId: string,
    category: NotificationCategory,
    channel: NotificationChannel,
    enabled: boolean,
  ): Promise<CategorySetting[]> {
    if (isLocked(category)) {
      throw new BadRequestException('These always reach you');
    }
    if (!usesChannel(category, channel)) {
      throw new BadRequestException(`These are never sent by ${channel}`);
    }
    const row = await this.db.queryOne<{ channels: unknown }>(
      `insert into notification_settings (user_id, channels)
       values ($1, jsonb_build_object($2::text, jsonb_build_object($3::text, $4::boolean)))
       on conflict (user_id) do update
         set channels = jsonb_set(
               notification_settings.channels,
               array[$2::text],
               coalesce(notification_settings.channels -> $2::text, '{}'::jsonb)
                 || jsonb_build_object($3::text, $4::boolean)
             ),
             updated_at = now()
       returning channels`,
      [userId, category, channel, enabled],
    );
    return presentSettings(row?.channels);
  }

  /**
   * What each of these people stored, for a delivery batch. Someone who never
   * changed anything has no entry, which `allows` reads as everything on.
   */
  async storedFor(userIds: readonly string[]): Promise<Map<string, unknown>> {
    if (userIds.length === 0) return new Map();
    const rows = await this.db.query<{ user_id: string; channels: unknown }>(
      `select user_id, channels from notification_settings
        where user_id = any($1::uuid[])`,
      [[...userIds]],
    );
    return new Map(rows.map((row) => [row.user_id, row.channels]));
  }
}
