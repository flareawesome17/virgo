import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { blockedBetween } from '../safety/block-sql';
import { ShelvesService } from './shelves.service';
import {
  CONNECTED_TO_AUTHOR,
  ShowcasesService,
  type Showcase,
  type ShowcaseRow,
} from './showcases.service';

/**
 * The feed.
 *
 * Signed in, and deliberately so for now. An open-web feed needs media that is
 * not behind a signed url — the renditions would have to move to the public
 * bucket with permanent CDN addresses, the way avatars and covers already work,
 * because a cacheable public page cannot have credentials in its image urls.
 * That is a storage migration with a backfill behind it. The feed people scroll
 * inside the app needs none of it, so it is not waiting on it.
 *
 * Two scopes, and neither is personalised yet. "Everyone" is everything public,
 * newest first; "Connections" is the same from people you are actually
 * connected to. Ranking on what people kept is the obvious next step — the
 * count is maintained and indexed for it — but a feed that claims to be picked
 * for you while ordering by time is a feed that lies, so it orders by time and
 * says so.
 */

export type FeedScope = 'everyone' | 'connections';

export interface FeedItem extends Showcase {
  maker: {
    id: string;
    displayName: string;
    handle: string | null;
    avatarUrl: string | null;
    title: string | null;
  };
  /** Whether this viewer already has it on a shelf, so the button draws right. */
  keptByMe: boolean;
}

export interface FeedPage {
  items: FeedItem[];
  nextCursor: string | null;
}

/** Enough to scroll, few enough that one page is one round trip of thumbnails. */
const PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 30;

interface MakerRow extends ShowcaseRow {
  display_name: string | null;
  handle: string | null;
  avatar_url: string | null;
  user_title: string | null;
}

/**
 * Keyset, not offset. A feed people post to while it is being read renumbers
 * every offset under them, which shows the same showcase twice and skips
 * another; a cursor on (published_at, id) cannot.
 */
function encodeCursor(publishedAt: string, id: string): string {
  return Buffer.from(`${publishedAt}|${id}`, 'utf8').toString('base64url');
}

function decodeCursor(cursor: string | undefined): { at: string; id: string } | null {
  if (!cursor) return null;
  try {
    const [at, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
    // A cursor is ours, but it arrives from a client, so it is checked rather
    // than trusted: a bad one reads as the first page, never as an error.
    if (!at || !id || Number.isNaN(Date.parse(at))) return null;
    return { at, id };
  } catch {
    return null;
  }
}

@Injectable()
export class FeedService {
  constructor(
    private readonly db: DatabaseService,
    private readonly showcases: ShowcasesService,
    private readonly shelves: ShelvesService,
  ) {}

  async page(
    viewerId: string,
    opts: { scope?: FeedScope; cursor?: string; limit?: number } = {},
  ): Promise<FeedPage> {
    const scope: FeedScope = opts.scope === 'connections' ? 'connections' : 'everyone';
    const limit = Math.min(Math.max(opts.limit ?? PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const after = decodeCursor(opts.cursor);

    // $1 published_at cursor, $2 viewer, $3 id cursor, $4 limit.
    // $2 is named `$2` because CONNECTED_TO_AUTHOR and blockedBetween are written
    // against that position; keep it second.
    const rows = await this.db.query<MakerRow>(
      `select s.*,
              u.display_name, u.handle, u.avatar_url, u.title as user_title
         from showcases s
         join users u on u.id = s.user_id
        where s.published_at is not null
          and s.unpublished_at is null
          -- Your own work is IN the feed. It was left out at first, on the
          -- reasoning that your own work is not inspiration and is already on
          -- your profile — which reads as a bug the moment you post something
          -- and land on a feed without it, and reads as a broken feature while
          -- few enough people have posted that yours was the only one there.
          -- Every feed anybody has used shows them their own posts.
          and u.suspended_at is null
          and (u.disabled_until is null or u.disabled_until <= now())
          and not ${blockedBetween('$2', 's.user_id')}
          and ${
            scope === 'connections'
              ? `(s.user_id = $2 or ${CONNECTED_TO_AUTHOR})`
              : `(s.user_id = $2 or s.visibility = 'public' or ${CONNECTED_TO_AUTHOR})`
          }
          and ($1::timestamptz is null
               or (s.published_at, s.id) < ($1::timestamptz, $3::uuid))
        order by s.published_at desc, s.id desc
        limit $4`,
      [after?.at ?? null, viewerId, after?.id ?? null, limit + 1],
    );

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    const showcases = await this.showcases.hydrate(page, false);
    const kept = new Set(
      await this.shelves.keptAmong(
        viewerId,
        showcases.map((s) => s.id),
      ),
    );

    const items: FeedItem[] = [];
    for (let i = 0; i < showcases.length; i++) {
      const showcase = showcases[i];
      // A showcase whose every piece lost its web copy has nothing to draw.
      // Dropped here rather than rendered as a gap, the same rule the public
      // portfolio read uses.
      if (showcase.pieces.length === 0) continue;
      const row = page[i];
      items.push({
        ...showcase,
        maker: {
          id: row.user_id,
          displayName: row.display_name ?? 'Someone',
          handle: row.handle,
          avatarUrl: row.avatar_url,
          title: row.user_title,
        },
        keptByMe: kept.has(showcase.id),
      });
    }

    // The cursor comes from the last row READ, not the last row returned, so a
    // page whose items were all dropped still moves forward instead of handing
    // back the same cursor for ever.
    const last = page[page.length - 1];
    return {
      items,
      nextCursor:
        hasMore && last
          ? encodeCursor(
              last.published_at instanceof Date
                ? last.published_at.toISOString()
                : String(last.published_at),
              last.id,
            )
          : null,
    };
  }

}
