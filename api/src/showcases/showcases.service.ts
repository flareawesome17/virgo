import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { blockedBetween } from '../safety/block-sql';
import { MediaLinkService } from '../storage/media-link.service';
import { PUBLISHED_URL_TTL_SECONDS } from '../storage/storage.config';
import { StorageService } from '../storage/storage.service';
import { MAX_SOURCE_BYTES, ThumbnailsService } from '../storage/thumbnails.service';
import type {
  CreateShowcaseDto,
  ShowcaseVisibility,
  UpdateShowcaseDto,
} from './dto/showcase.dto';

/**
 * Showcases: a piece of work somebody posted, and the note on how they made it.
 *
 * Distinct from the portfolio (031), which holds one image or one album per row
 * and only ever points at the owner's own files. A showcase is a set — up to ten
 * pieces, the first of them the cover — and it carries the craft note that is
 * the whole reason to read a feed of them.
 *
 * `portfolio_items` is untouched and still serves every profile. Nothing here
 * reads or writes it.
 */

/**
 * How many a person may have. Not a storage limit — the files are counted
 * against the quota either way — but an unbounded per-account row count on a
 * table the feed reads is a spam surface, and nobody curating their own work
 * needs a hundred and one posts.
 */
export const MAX_SHOWCASES = 100;

/**
 * A profile photo or cover is never a piece of work. Same rule and same reason
 * as the portfolio's: changing either deletes the old object, and a showcase
 * made from one would lose its cover unannounced.
 */
const PROFILE_PHOTO_KEY = /^users\/[^/]+\/(avatars|covers)\//;

/**
 * True when $2 and the showcase's author are actually connected.
 *
 * Both rows, always. A friendship is two rows and one accepted row on its own
 * is what an unfriend leaves behind — trusting it is the bug MIRRORED_ACCEPTED_JOIN
 * exists to prevent, and a connections-only showcase shown to somebody who
 * unfriended its author is the version of it that matters here.
 */
export const connectedTo = (viewer: string, author: string): string => `exists (
  select 1 from friends mine
   join friends theirs
     on theirs.user_id = mine.friend_user_id
    and theirs.friend_user_id = mine.user_id
    and theirs.status = 'accepted'
  where mine.user_id = ${viewer} and mine.friend_user_id = ${author}
    and mine.status = 'accepted'
)`;

/** The shape both existing callers use: viewer at $2, author on `s`. */
export const CONNECTED_TO_AUTHOR = connectedTo('$2', 's.user_id');

export interface ShowcasePiece {
  fileKey: string;
  url: string;
  displaySources: ReturnType<MediaLinkService['displaySources']>;
  /** False when this piece has no web copy, so the owner can see which one. */
  publiclyShown?: boolean;
}

export interface Showcase {
  id: string;
  userId: string;
  title: string | null;
  caption: string | null;
  craftNote: string | null;
  craftTags: string[];
  category: string | null;
  location: string | null;
  visibility: ShowcaseVisibility;
  allowDownloads: boolean;
  allowComments: boolean;
  showHire: boolean;
  publishedAt: string | null;
  hiddenAt: string | null;
  keptCount: number;
  likeCount: number;
  pieces: ShowcasePiece[];
  createdAt: string;
}

export interface ShowcaseRow {
  id: string;
  user_id: string;
  title: string | null;
  caption: string | null;
  craft_note: string | null;
  craft_tags: string[] | null;
  category: string | null;
  location: string | null;
  visibility: ShowcaseVisibility;
  allow_downloads: boolean;
  allow_comments: boolean;
  show_hire: boolean;
  published_at: Date | string | null;
  hidden_at: Date | string | null;
  kept_count: number;
  like_count: number;
  created_at: Date | string;
}

interface PieceRow {
  showcase_id: string;
  file_key: string;
  thumb_key: string | null;
  display_widths: number[] | null;
}

const asIso = (v: Date | string | null): string | null =>
  v === null ? null : v instanceof Date ? v.toISOString() : v;

@Injectable()
export class ShowcasesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly storage: StorageService,
    private readonly mediaLink: MediaLinkService,
    private readonly thumbs: ThumbnailsService,
  ) {}

  // ── reads ──────────────────────────────────────────────────────────────────

  /** Everything one person has posted, drafts included. Their own editor only. */
  async listMine(userId: string): Promise<Showcase[]> {
    const rows = await this.db.query<ShowcaseRow>(
      `select * from showcases
        where user_id = $1
        order by published_at desc nulls first, created_at desc`,
      [userId],
    );
    return this.hydrate(rows, true);
  }

  /**
   * One showcase as a given viewer may see it.
   *
   * Everything that could hide it is asked in one statement, so a showcase that
   * is not there answers in the same time whatever the reason — unpublished,
   * taken down, connections-only, or either party having blocked the other.
   */
  async one(viewerId: string, id: string): Promise<Showcase> {
    const row = await this.db.queryOne<ShowcaseRow>(
      `select s.* from showcases s
         join users u on u.id = s.user_id
        where s.id = $1
          and (
            s.user_id = $2
            or (
              s.published_at is not null
              and s.unpublished_at is null
              -- Taken down by the console. The author keeps their own view of
              -- it, through the s.user_id = $2 branch above.
              and s.hidden_at is null
              and (u.disabled_until is null or u.disabled_until <= now())
              and u.suspended_at is null
              and not ${blockedBetween('$2', 's.user_id')}
              and (s.visibility = 'public' or ${CONNECTED_TO_AUTHOR})
            )
          )`,
      [id, viewerId],
    );
    if (!row) throw new NotFoundException('Showcase not found');

    const [showcase] = await this.hydrate([row], row.user_id === viewerId);
    // A showcase whose every piece lost its web copy has nothing to show. The
    // owner still sees it, so they can fix or remove it.
    if (!showcase || (showcase.pieces.length === 0 && row.user_id !== viewerId)) {
      throw new NotFoundException('Showcase not found');
    }
    return showcase;
  }

  /**
   * One person's published showcases, as a given viewer may see them.
   *
   * By handle, because that is what a profile is addressed by and it saves the
   * caller a lookup it would only have to guard the same way. The account's own
   * gates — published, not suspended, not disabled, not blocked either way, and
   * the profile actually public — are asked in the same statement as the
   * showcases, so a profile that is not there and one with nothing on it are
   * not distinguishable by timing.
   */
  async byHandle(
    viewerId: string,
    handle: string,
    opts: { limit?: number } = {},
  ): Promise<Showcase[]> {
    const limit = Math.min(Math.max(opts.limit ?? 24, 1), 60);
    const rows = await this.db.query<ShowcaseRow>(
      `select s.* from showcases s
         join users u on u.id = s.user_id
        where lower(u.handle) = $1
          and s.published_at is not null
          and s.unpublished_at is null
          and s.hidden_at is null
          and u.suspended_at is null
          and (u.disabled_until is null or u.disabled_until <= now())
          and (u.public_profile = true or u.id = $2)
          and not ${blockedBetween('$2', 's.user_id')}
          and (s.visibility = 'public' or s.user_id = $2 or ${connectedTo('$2', 's.user_id')})
        order by s.published_at desc, s.id desc
        limit $3`,
      [handle.toLowerCase(), viewerId, limit],
    );

    const showcases = await this.hydrate(rows, false);
    // One whose every piece lost its web copy has nothing to draw.
    return showcases.filter((s) => s.pieces.length > 0);
  }

  // ── writes ─────────────────────────────────────────────────────────────────

  async create(userId: string, dto: CreateShowcaseDto): Promise<Showcase> {
    await this.assertRoom(userId);
    const keys = await this.usableKeys(userId, dto.fileKeys);

    const id = await this.db.transaction(async (client) => {
      const created = await client.query<{ id: string }>(
        `insert into showcases
           (user_id, title, caption, craft_note, craft_tags, category, location,
            visibility, allow_downloads, allow_comments, show_hire, published_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, case when $12 then now() else null end)
         returning id`,
        [
          userId,
          dto.title?.trim() || null,
          dto.caption?.trim() || null,
          dto.craftNote?.trim() || null,
          cleanTags(dto.craftTags),
          dto.category?.trim() || null,
          dto.location?.trim() || null,
          dto.visibility ?? 'public',
          dto.allowDownloads ?? false,
          dto.allowComments ?? true,
          dto.showHire ?? true,
          dto.publish ?? false,
        ],
      );
      const showcaseId = created.rows[0].id;
      await this.writePieces(client, showcaseId, userId, keys);
      return showcaseId;
    });

    return this.byIdForOwner(userId, id);
  }

  async update(userId: string, id: string, dto: UpdateShowcaseDto): Promise<Showcase> {
    await this.assertOwned(userId, id);
    const keys = dto.fileKeys ? await this.usableKeys(userId, dto.fileKeys) : null;

    await this.db.transaction(async (client) => {
      // coalesce($n, column) leaves anything the caller did not send alone. An
      // explicit null cannot be told from an absent field this way, which is
      // why clearing a field is done by sending an empty string — trimmed to
      // null above and below — rather than by sending null.
      await client.query(
        `update showcases set
           title = coalesce($3, title),
           caption = coalesce($4, caption),
           craft_note = coalesce($5, craft_note),
           craft_tags = coalesce($6, craft_tags),
           category = coalesce($7, category),
           location = coalesce($8, location),
           visibility = coalesce($9, visibility),
           allow_downloads = coalesce($10, allow_downloads),
           allow_comments = coalesce($11, allow_comments),
           show_hire = coalesce($12, show_hire),
           updated_at = now()
         where id = $1 and user_id = $2`,
        [
          id,
          userId,
          dto.title === undefined ? null : dto.title.trim() || null,
          dto.caption === undefined ? null : dto.caption.trim() || null,
          dto.craftNote === undefined ? null : dto.craftNote.trim() || null,
          dto.craftTags === undefined ? null : cleanTags(dto.craftTags),
          dto.category === undefined ? null : dto.category.trim() || null,
          dto.location === undefined ? null : dto.location.trim() || null,
          dto.visibility ?? null,
          dto.allowDownloads ?? null,
          dto.allowComments ?? null,
          dto.showHire ?? null,
        ],
      );

      if (keys) {
        // Replaced whole, in one transaction: the order carries the cover, so a
        // set that is half old and half new has no correct reading.
        await client.query('delete from showcase_items where showcase_id = $1', [id]);
        await this.writePieces(client, id, userId, keys);
      }
    });

    return this.byIdForOwner(userId, id);
  }

  /**
   * Post it, or take it down.
   *
   * published_at is kept when it is taken down, and unpublished_at set instead,
   * so putting it back does not move it to the top of a profile or lose when it
   * first went out. Putting it back clears unpublished_at rather than restamping.
   */
  async setPublished(userId: string, id: string, published: boolean): Promise<Showcase> {
    await this.assertOwned(userId, id);
    await this.db.query(
      published
        ? `update showcases
              set published_at = coalesce(published_at, now()),
                  unpublished_at = null,
                  updated_at = now()
            where id = $1 and user_id = $2`
        : `update showcases
              set unpublished_at = now(), updated_at = now()
            where id = $1 and user_id = $2`,
      [id, userId],
    );
    return this.byIdForOwner(userId, id);
  }

  /**
   * Delete it.
   *
   * The pieces go with it, and so does every shelf_items row anybody kept — that
   * cascade is the promise the taste model makes, that nobody's work outlives
   * their control of it. The files themselves are untouched.
   */
  async remove(userId: string, id: string): Promise<void> {
    const gone = await this.db.query(
      'delete from showcases where id = $1 and user_id = $2 returning id',
      [id, userId],
    );
    if (gone.length === 0) throw new NotFoundException('Showcase not found');
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private async byIdForOwner(userId: string, id: string): Promise<Showcase> {
    const row = await this.db.queryOne<ShowcaseRow>(
      'select * from showcases where id = $1 and user_id = $2',
      [id, userId],
    );
    if (!row) throw new NotFoundException('Showcase not found');
    const [only] = await this.hydrate([row], true);
    return only;
  }

  private async assertOwned(userId: string, id: string): Promise<void> {
    const row = await this.db.queryOne<{ id: string }>(
      'select id from showcases where id = $1 and user_id = $2',
      [id, userId],
    );
    // The same answer whether it belongs to someone else or does not exist.
    if (!row) throw new NotFoundException('Showcase not found');
  }

  private async assertRoom(userId: string): Promise<void> {
    const row = await this.db.queryOne<{ count: string }>(
      'select count(*)::text as count from showcases where user_id = $1',
      [userId],
    );
    if (Number(row?.count ?? 0) >= MAX_SHOWCASES) {
      throw new BadRequestException(
        `You can have up to ${MAX_SHOWCASES} showcases. Delete one to post another.`,
      );
    }
  }

  /**
   * The keys that may go in, in the order they were given, deduplicated.
   *
   * Every one is checked for ownership, for being an image, and for having a
   * web copy — generating one now if it has none, the way the portfolio does,
   * because a piece with no thumbnail is a piece the feed will not serve and
   * finding that out after posting is what the portfolio got wrong.
   */
  private async usableKeys(userId: string, requested: string[]): Promise<string[]> {
    const keys = [...new Set(requested)];

    for (const key of keys) {
      if (PROFILE_PHOTO_KEY.test(key)) {
        throw new BadRequestException('Choose photos from your uploads.');
      }
    }

    const files = await this.db.query<{
      key: string;
      content_type: string | null;
      size_bytes: string | number;
      thumb_key: string | null;
      display_widths: number[] | null;
      blur_data_url: string | null;
    }>(
      `select key, content_type, size_bytes, thumb_key, display_widths, blur_data_url
         from user_files where user_id = $1 and key = any($2::text[])`,
      [userId, keys],
    );

    const byKey = new Map(files.map((f) => [f.key, f]));
    for (const key of keys) {
      const file = byKey.get(key);
      // Same answer whether it is somebody else's or does not exist.
      if (!file) throw new NotFoundException('File not found');
      if (!file.content_type?.startsWith('image/')) {
        throw new BadRequestException('Only photographs can go in a showcase.');
      }
      if (file.thumb_key) continue;

      const size = Number(file.size_bytes);
      if (size > MAX_SOURCE_BYTES) {
        throw new BadRequestException({
          statusCode: 400,
          error: 'Bad Request',
          code: 'SHOWCASE_TOO_LARGE',
          message: 'That photo is too large to post. Choose one under 40 MB.',
        });
      }
      const made = await this.thumbs.generate(key, file.content_type, size, {
        displayWidths: file.display_widths,
        blurDataUrl: file.blur_data_url,
      });
      if (!made) {
        throw new BadRequestException({
          statusCode: 400,
          error: 'Bad Request',
          code: 'SHOWCASE_NO_WEB_COPY',
          message: "That photo can't be posted. Try a JPEG or PNG copy of it.",
        });
      }
    }

    return keys;
  }

  private async writePieces(
    client: { query: (sql: string, params: unknown[]) => Promise<unknown> },
    showcaseId: string,
    userId: string,
    keys: string[],
  ): Promise<void> {
    // One statement whatever the count: unnest pairs each key with its index,
    // so position 0 is the first key the caller sent and the cover needs no
    // separate column to say so.
    await client.query(
      `insert into showcase_items (showcase_id, user_id, file_key, position)
       select $1, $2, k.key, k.ord - 1
         from unnest($3::text[]) with ordinality as k(key, ord)`,
      [showcaseId, userId, keys],
    );
  }

  /** Rows plus their pieces, presented. One query for every piece, not one each. */
  async hydrate(rows: ShowcaseRow[], forOwner: boolean): Promise<Showcase[]> {
    if (rows.length === 0) return [];

    const pieces = await this.db.query<PieceRow>(
      `select i.showcase_id, i.file_key, f.thumb_key, f.display_widths
         from showcase_items i
         join user_files f on f.key = i.file_key and f.user_id = i.user_id
        where i.showcase_id = any($1::uuid[])
        order by i.showcase_id, i.position, i.created_at`,
      [rows.map((r) => r.id)],
    );

    const grouped = new Map<string, ShowcasePiece[]>();
    for (const piece of pieces) {
      const presented = await this.presentPiece(piece, forOwner);
      if (!presented) continue;
      const list = grouped.get(piece.showcase_id);
      if (list) list.push(presented);
      else grouped.set(piece.showcase_id, [presented]);
    }

    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      title: row.title,
      caption: row.caption,
      craftNote: row.craft_note,
      craftTags: row.craft_tags ?? [],
      category: row.category,
      location: row.location,
      visibility: row.visibility,
      allowDownloads: row.allow_downloads,
      allowComments: row.allow_comments,
      showHire: row.show_hire,
      publishedAt: asIso(row.published_at),
      hiddenAt: asIso(row.hidden_at),
      keptCount: Number(row.kept_count),
      likeCount: Number(row.like_count),
      pieces: grouped.get(row.id) ?? [],
      createdAt: asIso(row.created_at)!,
    }));
  }

  /**
   * One piece, or null when there is nothing it may be shown as.
   *
   * The thumbnail and never the original on a public read: it is a re-encode, so
   * the camera's EXIF and GPS do not survive it. The owner's own editor may fall
   * back to the original, because it is their file and a tile they cannot
   * recognise is a tile they cannot remove.
   */
  private async presentPiece(row: PieceRow, forOwner: boolean): Promise<ShowcasePiece | null> {
    const displaySources = this.mediaLink.displaySources(
      row.file_key,
      row.display_widths,
      PUBLISHED_URL_TTL_SECONDS,
    );

    if (forOwner) {
      const url = await this.storage.mediaUrl(
        row.thumb_key ?? row.file_key,
        PUBLISHED_URL_TTL_SECONDS,
      );
      return {
        fileKey: row.file_key,
        url: url ?? '',
        displaySources,
        publiclyShown: row.thumb_key !== null,
      };
    }

    const url = await this.storage.mediaUrl(row.thumb_key, PUBLISHED_URL_TTL_SECONDS);
    if (!url) return null;
    return { fileKey: row.file_key, url, displaySources };
  }
}

/** Trimmed, empties dropped, duplicates dropped, order kept. */
function cleanTags(tags: string[] | undefined): string[] {
  if (!tags) return [];
  return [...new Set(tags.map((t) => t.trim()).filter((t) => t.length > 0))];
}
