import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  appliesTo,
  MOBILE_PLATFORMS,
  normalizeVersion,
  type Client,
  type ClientPlatform,
  type Target,
} from './app-update-targeting';
import type { FeedItem } from './notification-feed.service';
import { PushService } from './push.service';

/**
 * How far back announcements are shown. The same window the notification list
 * keeps its own rows for, so the two halves of one list age out together.
 */
const RETENTION_DAYS = 90;

/**
 * A ceiling on rows read per request. Announcements arrive a few a week, so the
 * retention window holds dozens; this only stops a mistake — a loop posting
 * thousands — from turning every badge poll into a full scan.
 */
const MAX_CANDIDATES = 500;

export interface AnnounceInput {
  slug: string;
  platforms: ClientPlatform[];
  minVersion?: string | null;
  maxVersion?: string | null;
  version?: string | null;
  title: string;
  body: string;
  url?: string | null;
  /** Whether phones targeted by this announcement are also pushed. */
  push: boolean;
}

interface UpdateRow {
  id: string;
  platforms: string[];
  min_version: string | null;
  max_version: string | null;
  version: string | null;
  title: string;
  body: string;
  url: string | null;
  published_at: Date;
  read_at: Date | null;
}

/** An announcement, shaped like any other entry in the notification list. */
function present(row: UpdateRow): FeedItem {
  return {
    id: row.id,
    topic: 'app-update',
    title: row.title,
    body: row.body,
    data: {
      type: 'app-update',
      updateId: row.id,
      ...(row.version ? { version: row.version } : {}),
      ...(row.url ? { url: row.url } : {}),
    },
    readAt: row.read_at ? row.read_at.toISOString() : null,
    createdAt: row.published_at.toISOString(),
  };
}

function targetOf(row: Pick<UpdateRow, 'platforms' | 'min_version' | 'max_version'>): Target {
  return {
    platforms: row.platforms,
    minVersion: row.min_version,
    maxVersion: row.max_version,
  };
}

/**
 * Announcing an update to the clients it concerns.
 *
 * One row per announcement, targeted at platforms and version ranges, rather
 * than one row per person: an account can be on the web, a Mac and a phone at
 * once, and each needs to hear about a different set of changes. Each client
 * says what it is, and gets the announcements that apply to it.
 *
 * Only announcements published after an account was created are shown. A
 * person who signs up today has no use for three months of notes about bugs
 * they never met.
 */
@Injectable()
export class AppUpdatesService {
  private readonly logger = new Logger(AppUpdatesService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly push: PushService,
  ) {}

  /**
   * Announcements for this client, newest first, optionally before a moment.
   *
   * The database narrows by platform, age and the account's own start date,
   * which are cheap; version bounds are checked here, because comparing
   * `1.10.0` with `1.9.0` correctly is not something text comparison does.
   * One this account deleted is gone from its list, though not from anyone
   * else's.
   */
  async visibleTo(
    userId: string,
    client: Client,
    before: Date | null = null,
    only: string | null = null,
  ): Promise<FeedItem[]> {
    const rows = await this.db.query<UpdateRow>(
      `select u.id, u.platforms, u.min_version, u.max_version, u.version,
              u.title, u.body, u.url, u.published_at, r.read_at
         from app_updates u
         join users me on me.id = $1
         left join app_update_reads r
                on r.update_id = u.id and r.user_id = $1
        where $2 = any(u.platforms)
          and u.published_at >= me.created_at
          and u.published_at > now() - make_interval(days => $3)
          and ($4::timestamptz is null or u.published_at < $4)
          and r.hidden_at is null
          and ($6::uuid is null or u.id = $6)
        order by u.published_at desc
        limit $5`,
      [userId, client.platform, RETENTION_DAYS, before, MAX_CANDIDATES, only],
    );
    return rows.filter((row) => appliesTo(targetOf(row), client)).map(present);
  }

  /** One announcement, if this client can see it. */
  async one(userId: string, client: Client, id: string): Promise<FeedItem | null> {
    const [item] = await this.visibleTo(userId, client, null, id);
    return item ?? null;
  }

  async unreadCount(userId: string, client: Client): Promise<number> {
    const visible = await this.visibleTo(userId, client);
    return visible.filter((item) => !item.readAt).length;
  }

  /**
   * Marks announcements read for this account.
   *
   * With ids, only those that are announcements are touched — the same list of
   * ids also names ordinary notifications, which the feed marks separately.
   *
   * Without ids — "mark all read" — only what this client can see is marked.
   * Clearing the web app's list must not silently clear the phone's, whose
   * announcements were never shown on the web.
   */
  async markRead(
    userId: string,
    client: Client | null,
    ids?: readonly string[],
  ): Promise<number> {
    let updateIds: string[];
    if (ids?.length) {
      updateIds = [...ids];
    } else {
      if (!client) return 0;
      const visible = await this.visibleTo(userId, client);
      updateIds = visible.filter((item) => !item.readAt).map((item) => item.id);
    }
    if (updateIds.length === 0) return 0;

    // An upsert, not insert-or-nothing: a row marked unread again keeps its
    // place (and whether it was hidden) and only gets its read time back.
    const rows = await this.db.query<{ update_id: string }>(
      `insert into app_update_reads (user_id, update_id, read_at)
       select $1, u.id, now() from app_updates u where u.id = any($2::uuid[])
       on conflict (user_id, update_id) do update
         set read_at = now()
         where app_update_reads.read_at is null
       returning update_id`,
      [userId, updateIds],
    );
    return rows.length;
  }

  /**
   * Marks announcements unread again. Only ids that are announcements this
   * account has read are touched; the rest of the ids are ordinary
   * notifications, or already unread.
   */
  async markUnread(userId: string, ids: readonly string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const rows = await this.db.query<{ update_id: string }>(
      `update app_update_reads set read_at = null
        where user_id = $1
          and update_id = any($2::uuid[])
          and read_at is not null
       returning update_id`,
      [userId, [...ids]],
    );
    return rows.length;
  }

  /**
   * Deletes announcements from this account's list.
   *
   * The announcement is shared, so this marks it hidden for them rather than
   * removing it — and read, so it can never count towards a badge again.
   */
  async hide(userId: string, ids: readonly string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const rows = await this.db.query<{ update_id: string }>(
      `insert into app_update_reads (user_id, update_id, read_at, hidden_at)
       select $1, u.id, now(), now() from app_updates u where u.id = any($2::uuid[])
       on conflict (user_id, update_id) do update
         set hidden_at = coalesce(app_update_reads.hidden_at, now())
       returning update_id`,
      [userId, [...ids]],
    );
    return rows.length;
  }

  /**
   * Publishes an announcement, and pushes it to the phones it concerns.
   *
   * Idempotent on `slug`: posting the same one again — a workflow re-run, a
   * retried request — returns the original and pushes nothing, so nobody's
   * phone buzzes twice for one update.
   */
  async announce(
    input: AnnounceInput,
  ): Promise<{ id: string; created: boolean; pushed: number }> {
    const inserted = await this.db.queryOne<{ id: string }>(
      `insert into app_updates
         (slug, platforms, min_version, max_version, version, title, body, url)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (slug) do nothing
       returning id`,
      [
        input.slug,
        input.platforms,
        normalizeVersion(input.minVersion),
        normalizeVersion(input.maxVersion),
        normalizeVersion(input.version),
        input.title,
        input.body,
        input.url ?? null,
      ],
    );

    if (!inserted) {
      const existing = await this.db.queryOne<{ id: string }>(
        'select id from app_updates where slug = $1',
        [input.slug],
      );
      this.logger.log(`Announcement ${input.slug} already exists; nothing sent`);
      return { id: existing!.id, created: false, pushed: 0 };
    }

    const pushed = input.push ? await this.pushToPhones(inserted.id, input) : 0;
    this.logger.log(
      `Announced ${input.slug} to ${input.platforms.join(', ')}; pushed to ${pushed} device(s)`,
    );
    return { id: inserted.id, created: true, pushed };
  }

  /**
   * Pushes an announcement to the phones it applies to.
   *
   * Only to devices that reported an app version. That is not just what makes
   * version targeting possible — a token with a version was registered by a
   * build that also created the "App updates" channel on Android and knows how
   * to open one of these when tapped. An older build would receive a push on a
   * channel it never made, and on Android that notification is not shown.
   */
  private async pushToPhones(updateId: string, input: AnnounceInput): Promise<number> {
    const phones = input.platforms.filter((p) => MOBILE_PLATFORMS.includes(p));
    if (phones.length === 0) return 0;

    const tokens = await this.db.query<{
      token: string;
      platform: ClientPlatform;
      app_version: string | null;
    }>(
      // Minus anyone who switched announcement pushes off. No settings row, or
      // no word on it, is on — as it was for everyone before settings existed.
      // Minus suspended accounts too, as PushService.tokensFor leaves them out.
      `select t.token, t.platform, t.app_version
         from push_tokens t
         join users u on u.id = t.user_id and u.suspended_at is null
         left join notification_settings ns on ns.user_id = t.user_id
        where t.disabled_at is null
          and t.app_version is not null
          and t.platform = any($1)
          and coalesce((ns.channels -> 'updates' ->> 'push')::boolean, true)`,
      [phones],
    );

    const target: Target = {
      platforms: input.platforms,
      minVersion: input.minVersion ?? null,
      maxVersion: input.maxVersion ?? null,
    };
    const recipients = tokens.filter((t) =>
      appliesTo(target, { platform: t.platform, version: normalizeVersion(t.app_version) }),
    );
    if (recipients.length === 0) return 0;

    const result = await this.push.send(
      recipients.map((t) => ({
        to: t.token,
        title: input.title,
        body: input.body,
        channelId: 'updates',
        sound: null,
        data: {
          type: 'app-update',
          updateId,
          ...(input.url ? { url: input.url } : {}),
        },
      })),
    );
    return result.sent;
  }
}
