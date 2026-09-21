import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DatabaseService } from '../database/database.service';
import type { NotificationTopic } from '../realtime/realtime.gateway';
import type { Client } from './app-update-targeting';
import { AppUpdatesService } from './app-updates.service';

/** One stored notification, as the clients see it. */
export interface FeedItem {
  id: string;
  topic: NotificationTopic;
  title: string;
  body: string;
  data: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

interface FeedRow {
  id: string;
  topic: NotificationTopic;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read_at: Date | null;
  created_at: Date;
}

/**
 * How long a notification is worth keeping.
 *
 * Long enough that coming back from a holiday still shows what happened;
 * short enough that the table does not grow without bound for the sake of
 * rows nobody will scroll to. The thing a notification points at — the
 * application, the booking, the message — outlives it either way.
 */
const RETENTION_DAYS = 90;

/** The most anyone keeps, however recent. Stops one noisy week filling a list. */
const MAX_PER_USER = 200;

/**
 * Reading the notification list.
 *
 * Separate from NotifyService, which writes: that one is a global, injected
 * into a dozen features, and none of them has any business being able to read
 * somebody's notifications.
 */
@Injectable()
export class NotificationFeedService {
  private readonly logger = new Logger(NotificationFeedService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly updates: AppUpdatesService,
  ) {}

  /**
   * The list, newest first.
   *
   * Keyset paginated on `created_at` rather than by offset — an offset page
   * shifts under you every time something new arrives, which on this list is
   * exactly when someone is looking at it.
   *
   * With a `client`, update announcements for that platform and version are
   * merged in. Each source is read up to the same cursor and the two are cut
   * to one page together, so anything older from either lands on the next
   * page rather than being skipped. Without one — an app too old to say what
   * it is — the list is exactly what it always was.
   */
  async list(
    userId: string,
    params: { limit?: number; before?: string; client?: Client | null } = {},
  ): Promise<{ data: FeedItem[]; unread: number }> {
    const limit = Math.min(Math.max(params.limit ?? 30, 1), 100);
    const parsed = params.before ? new Date(params.before) : null;
    const before = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
    const client = params.client ?? null;

    const [rows, announcements] = await Promise.all([
      this.db.query<FeedRow>(
        `select id, topic, title, body, data, read_at, created_at
           from notifications
          where user_id = $1
            and ($3::timestamptz is null or created_at < $3)
          order by created_at desc
          limit $2`,
        [userId, limit, before],
      ),
      client ? this.updates.visibleTo(userId, client, before) : Promise.resolve([]),
    ]);

    const data = [...rows.map(present), ...announcements]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, limit);

    return { data, unread: await this.unreadCount(userId, client) };
  }

  /** Unread notifications, plus unread announcements for this client. */
  async unreadCount(userId: string, client: Client | null = null): Promise<number> {
    const [row, announcements] = await Promise.all([
      this.db.queryOne<{ count: string }>(
        `select count(*)::text as count from notifications
          where user_id = $1 and read_at is null`,
        [userId],
      ),
      client ? this.updates.unreadCount(userId, client) : Promise.resolve(0),
    ]);
    return Number(row?.count ?? 0) + announcements;
  }

  /**
   * Marks some or all of them read.
   *
   * Scoped to the caller in the statement itself, never by id alone: an id is
   * guessable and this is somebody's list of who contacted them.
   *
   * No 404 for an id that is not theirs. The honest reason is that "mark read"
   * is idempotent and a client retrying a stale id should not be told an error
   * it cannot act on; the useful side-effect is that this endpoint cannot be
   * used to find out whether a notification exists.
   */
  async markRead(
    userId: string,
    ids?: readonly string[],
    client: Client | null = null,
  ): Promise<number> {
    const [rows, announcements] = await Promise.all([
      this.db.query<{ id: string }>(
        `update notifications set read_at = now()
          where user_id = $1
            and read_at is null
            and ($2::uuid[] is null or id = any($2::uuid[]))
          returning id`,
        [userId, ids?.length ? [...ids] : null],
      ),
      // The same ids name announcements as well as notifications; each side
      // marks only the ones that are its own.
      this.updates.markRead(userId, client, ids),
    ]);
    return rows.length + announcements;
  }

  /**
   * Trims the table nightly.
   *
   * At 2am, ahead of the other sweeps rather than alongside them — this one
   * only deletes and there is no reason for it to contend with the retention
   * and cleanup passes that do real work an hour later.
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async sweep(): Promise<{ expired: number; trimmed: number }> {
    const expired = await this.db.query<{ id: string }>(
      `delete from notifications
        where created_at < now() - make_interval(days => $1)
        returning id`,
      [RETENTION_DAYS],
    );

    // Everything past the newest MAX_PER_USER for each account. The window
    // runs per user, so a busy account is trimmed without touching a quiet one.
    const trimmed = await this.db.query<{ id: string }>(
      `delete from notifications
        where id in (
          select id from (
            select id, row_number() over (
                     partition by user_id order by created_at desc
                   ) as rank
              from notifications
          ) ranked
          where rank > $1
        )
        returning id`,
      [MAX_PER_USER],
    );

    if (expired.length || trimmed.length) {
      this.logger.log(
        `notification sweep: ${expired.length} expired, ${trimmed.length} trimmed`,
      );
    }
    return { expired: expired.length, trimmed: trimmed.length };
  }
}

function present(row: FeedRow): FeedItem {
  return {
    id: row.id,
    topic: row.topic,
    title: row.title,
    body: row.body,
    data: row.data ?? {},
    readAt: row.read_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  };
}
