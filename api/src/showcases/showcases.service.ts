import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { blockedBetween } from '../safety/block-sql';
import { FilmPosterService } from '../storage/film-poster.service';
import { HlsService } from '../storage/hls.service';
import { MediaLinkService } from '../storage/media-link.service';
import { PUBLISHED_URL_TTL_SECONDS } from '../storage/storage.config';
import { StorageService } from '../storage/storage.service';
import { MAX_SOURCE_BYTES, ThumbnailsService } from '../storage/thumbnails.service';
import { pieceBase, ShowcaseMediaService } from './showcase-media.service';
import type {
  CreateShowcaseDto,
  ShowcaseVisibility,
  UpdateShowcaseDto,
} from './dto/showcase.dto';

/**
 * Showcases: a piece of work somebody posted, and the note on how they made it.
 *
 * Distinct from the portfolio (031), which holds one image or one album per row
 * and only ever points at the owner's own files. A showcase is a set — up to
 * twenty photographs, the first of them the cover, or one film on its own — and
 * it carries the craft note that is the whole reason to read a feed of them.
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

/**
 * The key a piece is known by in the API: its album file's, or, once that
 * file is gone and the piece lives on its own copies, its own id. The editors
 * send these back on save, so a piece whose file was deleted can still be
 * kept, moved or taken out.
 */
const ITEM_KEY = /^item:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const pieceKeyOf = (row: { id: string; file_key: string | null }): string =>
  row.file_key ?? `item:${row.id}`;

/** The shape both existing callers use: viewer at $2, author on `s`. */
export const CONNECTED_TO_AUTHOR = connectedTo('$2', 's.user_id');

export interface ShowcasePiece {
  fileKey: string;
  kind: 'image' | 'video';
  /** A still: the thumbnail for a photograph, the poster frame for a film. */
  url: string;
  /**
   * Where a film plays from: the adaptive ladder once it is built, the single
   * proxy until then. Null on a photograph, and null on a film with neither —
   * which is a film that is not served at all.
   */
  playbackUrl?: string | null;
  durationMs?: number | null;
  displaySources: ReturnType<MediaLinkService['displaySources']>;
  /** False when this piece has no web copy, so the owner can see which one. */
  publiclyShown?: boolean;
  /**
   * The piece's own size, upright, when it is known. The apps used to draw
   * every piece at one fixed shape and crop the rest away: a 3:2 photograph
   * lost close to half of itself on the post.
   */
  width?: number | null;
  height?: number | null;
}

export interface ShowcaseMaker {
  id: string;
  displayName: string;
  handle: string | null;
  avatarUrl: string | null;
  title: string | null;
}

/**
 * One showcase, read on its own.
 *
 * Carries who made it, which the list form does not: a list of your own work
 * needs no byline, and a single showcase somebody opened cannot offer to keep
 * it without being able to credit them for it.
 */
export interface ShowcaseDetail extends Showcase {
  maker: ShowcaseMaker;
  keptByMe: boolean;
  likedByMe: boolean;
}

/**
 * A showcase as anyone may see it, signed in or not: the page a shared link
 * opens (virgo.ph/p/:id). Only what the post itself shows — no account ids,
 * no counts beyond the likes on its face, and nothing about the reader.
 */
export interface PublicShowcase {
  id: string;
  title: string | null;
  caption: string | null;
  location: string | null;
  publishedAt: string;
  likeCount: number;
  maker: Omit<ShowcaseMaker, 'id'>;
  pieces: ShowcasePiece[];
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
  /**
   * Set while the author has it taken down. published_at is kept through a
   * take-down, so without this nothing could tell a live post from one that
   * is down, and the owner's "put it back up" could never be offered.
   */
  unpublishedAt: string | null;
  hiddenAt: string | null;
  keptCount: number;
  likeCount: number;
  commentCount: number;
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
  unpublished_at: Date | string | null;
  hidden_at: Date | string | null;
  kept_count: number;
  like_count: number;
  comment_count: number;
  created_at: Date | string;
}

interface PieceRow {
  item_id: string;
  showcase_id: string;
  user_id: string;
  file_key: string | null;
  // The piece's own copies (090), once the worker has made them.
  copied_at: Date | string | null;
  own_kind: 'image' | 'video' | null;
  own_thumb_key: string | null;
  own_poster_key: string | null;
  own_video_key: string | null;
  own_widths: number[] | null;
  own_width_px: number | null;
  own_height_px: number | null;
  own_duration_ms: string | number | null;
  // The album file, while it still exists.
  content_type: string | null;
  thumb_key: string | null;
  poster_key: string | null;
  proxy_key: string | null;
  hls_prefix: string | null;
  duration_ms: string | number | null;
  display_widths: number[] | null;
  width_px: number | null;
  height_px: number | null;
}

/** One stored piece, for working out what an edit keeps and what it drops. */
interface StoredPiece {
  id: string;
  user_id: string;
  file_key: string | null;
  thumb_key: string | null;
  poster_key: string | null;
  video_key: string | null;
  display_widths: number[] | null;
  // What it is, for the one-film rule: the piece's own copy says once it has
  // been made, and its album file says while it still exists.
  kind: string | null;
  content_type: string | null;
}

type PieceKind = 'image' | 'video';

/** A photograph, a film, or neither, by content type. */
const kindOf = (contentType: string | null | undefined): PieceKind | null =>
  contentType?.startsWith('video/') ? 'video' : contentType?.startsWith('image/') ? 'image' : null;

const storedKind = (piece: StoredPiece): PieceKind | null =>
  piece.kind === 'image' || piece.kind === 'video' ? piece.kind : kindOf(piece.content_type);

/**
 * A film is posted on its own.
 *
 * Any number of photographs up to the ceiling, or exactly one film and
 * nothing else: a card plays a film full-bleed, so a photograph beside it, or
 * a second film, has nowhere to be. Asked of the whole set a save leaves —
 * the pieces it keeps as well as the ones it adds — and only when a save
 * sends its pieces, so a post made before the rule still reads and edits.
 * A piece of unknown kind (its file gone, no copy made) still counts as a
 * piece.
 */
function assertFilmAlone(pieces: { key: string; kind: PieceKind | null }[]): void {
  const film = pieces.find((piece) => piece.kind === 'video');
  if (!film || pieces.length === 1) return;
  throw new BadRequestException({
    statusCode: 400,
    error: 'Bad Request',
    code: 'SHOWCASE_FILM_ALONE',
    message: 'A film is posted on its own. Post your photos separately.',
    // Which one, so the app can point at it.
    fileKey: film.key,
  });
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
    private readonly hls: HlsService,
    private readonly media: ShowcaseMediaService,
    private readonly posters: FilmPosterService,
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
  async one(viewerId: string, id: string): Promise<ShowcaseDetail> {
    const row = await this.db.queryOne<
      ShowcaseRow & {
        display_name: string | null;
        handle: string | null;
        avatar_url: string | null;
        user_title: string | null;
        kept_by_me: boolean;
        liked_by_me: boolean;
      }
    >(
      `select s.*,
              u.display_name, u.avatar_url, u.title as user_title,
              -- A handle is only a link once the profile is published: /profiles/:handle
              -- and hire both refuse an unpublished one, so handing it out made the
              -- avatar and Hire lead to "Profile not found".
              case when u.public_profile then u.handle end as handle,
              exists (
                select 1 from shelf_items i
                 where i.showcase_id = s.id and i.user_id = $2
              ) as kept_by_me,
              exists (
                select 1 from showcase_likes l
                 where l.showcase_id = s.id and l.user_id = $2
              ) as liked_by_me
         from showcases s
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

    const [base] = await this.hydrate([row], row.user_id === viewerId);
    const showcase: ShowcaseDetail | undefined = base && {
      ...base,
      maker: {
        id: row.user_id,
        displayName: row.display_name ?? 'Someone',
        handle: row.handle,
        avatarUrl: row.avatar_url,
        title: row.user_title,
      },
      keptByMe: row.kept_by_me,
      likedByMe: row.liked_by_me,
    };
    // A showcase whose every piece lost its web copy has nothing to show. The
    // owner still sees it, so they can fix or remove it.
    if (!showcase || (showcase.pieces.length === 0 && row.user_id !== viewerId)) {
      throw new NotFoundException('Showcase not found');
    }
    return showcase;
  }

  /**
   * One showcase as anybody may see it, with no account: the page a shared
   * link opens.
   *
   * Narrower than one(), never wider. There is no reader to be connected to or
   * blocked by, so only what is meant for everyone is answered: shown to
   * everyone ('public', not connections-only), posted, not taken down by its
   * author or the console, and by an account that is neither suspended nor
   * paused. The author gets no exception either — their own private or
   * unposted work is theirs to read in the app, not on the open web.
   *
   * Asked in one statement and refused with one answer, so a link to
   * something private and a link to nothing cannot be told apart.
   */
  async publicOne(id: string): Promise<PublicShowcase> {
    const row = await this.db.queryOne<
      ShowcaseRow & {
        display_name: string | null;
        handle: string | null;
        avatar_url: string | null;
        user_title: string | null;
      }
    >(
      `select s.*,
              u.display_name, u.avatar_url, u.title as user_title,
              -- A handle only once the profile is published, as everywhere
              -- else: an unpublished one leads to "Profile not found".
              case when u.public_profile then u.handle end as handle
         from showcases s
         join users u on u.id = s.user_id
        where s.id = $1
          and s.visibility = 'public'
          and s.published_at is not null
          and s.unpublished_at is null
          and s.hidden_at is null
          and u.suspended_at is null
          and (u.disabled_until is null or u.disabled_until <= now())`,
      [id],
    );
    if (!row) throw new NotFoundException('Showcase not found');

    // As a stranger: thumbnails and web copies, never an original.
    const [base] = await this.hydrate([row], false);
    // One whose every piece lost its web copy has nothing to show.
    if (!base || base.pieces.length === 0 || !base.publishedAt) {
      throw new NotFoundException('Showcase not found');
    }
    return {
      id: base.id,
      title: base.title,
      caption: base.caption,
      location: base.location,
      publishedAt: base.publishedAt,
      likeCount: base.likeCount,
      maker: {
        displayName: row.display_name ?? 'Someone',
        handle: row.handle,
        avatarUrl: row.avatar_url,
        title: row.user_title,
      },
      pieces: base.pieces,
    };
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
    opts: { limit?: number; cursor?: string } = {},
  ): Promise<{ data: Showcase[]; nextCursor: string | null }> {
    const limit = Math.min(Math.max(opts.limit ?? 24, 1), 60);
    const after = decodeShowcaseCursor(opts.cursor);
    const rows = await this.db.query<ShowcaseRow & { cursor_at: string }>(
      `select s.*, s.published_at::text as cursor_at from showcases s
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
          -- The next page. Visitors saw the newest 24 and nothing older.
          and ($4::timestamptz is null or (s.published_at, s.id) < ($4::timestamptz, $5::uuid))
        order by s.published_at desc, s.id desc
        limit $3`,
      [handle.toLowerCase(), viewerId, limit + 1, after?.at ?? null, after?.id ?? null],
    );

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const showcases = await this.hydrate(page, false);
    const last = page[page.length - 1];
    return {
      // One whose every piece lost its web copy has nothing to draw.
      data: showcases.filter((s) => s.pieces.length > 0),
      // From the last row read, so a page whose rows were all dropped still
      // moves on.
      nextCursor: hasMore && last ? encodeShowcaseCursor(last.cursor_at, last.id) : null,
    };
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

    this.queueLadders(keys);
    this.queueCopies(id);
    return this.byIdForOwner(userId, id);
  }

  async update(userId: string, id: string, dto: UpdateShowcaseDto): Promise<Showcase> {
    await this.assertOwned(userId, id);
    let keys: string[] | null = null;
    let stored: StoredPiece[] = [];
    if (dto.fileKeys) {
      keys = [...new Set(dto.fileKeys)];
      stored = await this.db.query<StoredPiece>(
        `select i.id, i.user_id, i.file_key, i.thumb_key, i.poster_key, i.video_key,
                i.display_widths, i.kind, f.content_type
           from showcase_items i
           left join user_files f on f.key = i.file_key and f.user_id = i.user_id
          where i.showcase_id = $1`,
        [id],
      );
      const byStoredKey = new Map(stored.map((piece) => [pieceKeyOf(piece), piece]));
      const added = keys.filter((key) => !byStoredKey.has(key));
      // A piece's own id is only ever one already in this showcase.
      if (added.some((key) => ITEM_KEY.test(key))) {
        throw new NotFoundException('File not found');
      }
      // The pieces that stay count towards the one-film rule as well.
      const staying = keys.flatMap((key) => {
        const piece = byStoredKey.get(key);
        return piece ? [{ key, kind: storedKind(piece) }] : [];
      });
      await this.usableKeys(userId, added, { order: keys, staying });
    }
    let dropped: StoredPiece[] = [];

    await this.db.transaction(async (client) => {
      /*
       * A text field not sent is null here and left alone. One sent empty is
       * the empty string, and clears it (nullif). It used to be trimmed to
       * null before it got here — the same as not sent — so coalesce kept the
       * old text, and Save said it had worked while the caption stayed.
       */
      await client.query(
        `update showcases set
           title = case when $3::text is null then title else nullif($3, '') end,
           caption = case when $4::text is null then caption else nullif($4, '') end,
           craft_note = case when $5::text is null then craft_note else nullif($5, '') end,
           craft_tags = coalesce($6, craft_tags),
           category = case when $7::text is null then category else nullif($7, '') end,
           location = case when $8::text is null then location else nullif($8, '') end,
           visibility = coalesce($9, visibility),
           allow_downloads = coalesce($10, allow_downloads),
           allow_comments = coalesce($11, allow_comments),
           show_hire = coalesce($12, show_hire),
           updated_at = now()
         where id = $1 and user_id = $2`,
        [
          id,
          userId,
          dto.title === undefined ? null : dto.title.trim(),
          dto.caption === undefined ? null : dto.caption.trim(),
          dto.craftNote === undefined ? null : dto.craftNote.trim(),
          dto.craftTags === undefined ? null : cleanTags(dto.craftTags),
          dto.category === undefined ? null : dto.category.trim(),
          dto.location === undefined ? null : dto.location.trim(),
          dto.visibility ?? null,
          dto.allowDownloads ?? null,
          dto.allowComments ?? null,
          dto.showHire ?? null,
        ],
      );

      if (keys) {
        // In one transaction: the order carries the cover, so a set that is
        // half old and half new has no correct reading. Pieces that stay are
        // kept rather than deleted and written again — their copies come with
        // them, and so does a piece whose album file is already gone.
        const wanted = new Set(keys);
        dropped = stored.filter((piece) => !wanted.has(pieceKeyOf(piece)));
        if (dropped.length > 0) {
          await client.query('delete from showcase_items where id = any($1::uuid[])', [
            dropped.map((piece) => piece.id),
          ]);
        }
        const byKey = new Map(stored.map((piece) => [pieceKeyOf(piece), piece]));
        for (const [position, key] of keys.entries()) {
          const piece = byKey.get(key);
          if (piece) {
            await client.query('update showcase_items set position = $2 where id = $1', [
              piece.id,
              position,
            ]);
          } else {
            await client.query(
              `insert into showcase_items (showcase_id, user_id, file_key, position)
               values ($1, $2, $3, $4)`,
              [id, userId, key, position],
            );
          }
        }
      }
    });

    if (keys) {
      this.queueLadders(keys.filter((key) => !ITEM_KEY.test(key)));
      this.queueCopies(id);
      if (dropped.length > 0) void this.media.erasePieces(dropped.flatMap(copiesOf));
    }
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
   * their control of it. The album files are untouched; the post's own copies
   * go with it.
   */
  async remove(userId: string, id: string): Promise<void> {
    const gone = await this.db.query(
      'delete from showcases where id = $1 and user_id = $2 returning id',
      [id, userId],
    );
    if (gone.length === 0) throw new NotFoundException('Showcase not found');
    // Its own copies too: they exist only for this post.
    await this.media.eraseShowcase(userId, id);
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
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        code: 'SHOWCASE_LIMIT',
        message: `You can have up to ${MAX_SHOWCASES} showcases. Delete one to post another.`,
      });
    }
  }

  /**
   * Ask for an adaptive ladder for any film that just went into a showcase.
   *
   * Deliberately not awaited: the ladder takes a minute or more to build and
   * posting must not wait on it. Until one exists the piece plays from its
   * 720p proxy, which is why a missing ladder is a quality question and never
   * a broken post. Rejections are swallowed for the same reason — a queue that
   * could not be written is not a reason to fail a post that is already saved.
   */
  private queueLadders(keys: string[]): void {
    void this.hls.enqueueKeys(keys).catch(() => undefined);
  }

  /**
   * Make this showcase's own copies now rather than when the minute's queue
   * reaches them. Not awaited, for the same reason as the ladders: posting
   * must not wait on an encode. Until they exist the post shows from the
   * album files, as it always did.
   */
  private queueCopies(showcaseId: string): void {
    void this.media.copyShowcase(showcaseId);
  }

  /**
   * The keys that may go in, in the order they were given, deduplicated.
   *
   * Every one is checked for ownership, for being a photograph or a film, and
   * for having something a feed can draw — generating it now if it has none,
   * the way the portfolio does, because a piece with no still is a piece the
   * feed will not serve and finding that out after posting is what the
   * portfolio got wrong.
   *
   * The two differ in what "something to draw" means. A photograph's
   * thumbnail is made from the original; a film's poster frame is one frame
   * of it, taken once the media worker has finished with the upload. Uploads
   * no longer get a poster, so a film is given one here, the first time it is
   * posted, and one the worker has not finished with yet is refused rather
   * than waited for.
   *
   * On an edit, `edit` carries the pieces it keeps, by kind, and the whole set
   * in order: the one-film rule is about the set the save leaves, not only
   * what it adds. It is asked after every key is known to be a photograph or a
   * film and before any thumbnail is made, so a set that cannot be posted
   * costs no encoding.
   */
  private async usableKeys(
    userId: string,
    requested: string[],
    edit?: { order: string[]; staying: { key: string; kind: PieceKind | null }[] },
  ): Promise<string[]> {
    const keys = [...new Set(requested)];

    for (const key of keys) {
      if (PROFILE_PHOTO_KEY.test(key)) {
        throw new BadRequestException('Choose photos from your uploads.');
      }
    }

    const files =
      keys.length === 0
        ? []
        : await this.db.query<{
            key: string;
            content_type: string | null;
            size_bytes: string | number;
            thumb_key: string | null;
            poster_key: string | null;
            display_widths: number[] | null;
            blur_data_url: string | null;
            processing_status: string | null;
          }>(
            `select key, content_type, size_bytes, thumb_key, poster_key,
                    display_widths, blur_data_url, processing_status
               from user_files where user_id = $1 and key = any($2::text[])`,
            [userId, keys],
          );

    const byKey = new Map(files.map((f) => [f.key, f]));
    const adding: { key: string; kind: PieceKind | null }[] = [];
    for (const key of keys) {
      const file = byKey.get(key);
      // Same answer whether it is somebody else's or does not exist.
      if (!file) throw new NotFoundException('File not found');
      const kind = kindOf(file.content_type);
      if (!kind) {
        throw new BadRequestException('Only photographs and films can go in a showcase.');
      }
      adding.push({ key, kind });
    }

    // In the order the post will show them, so the film named is the first
    // one there.
    const order = edit?.order ?? keys;
    assertFilmAlone(
      [...adding, ...(edit?.staying ?? [])].sort(
        (a, b) => order.indexOf(a.key) - order.indexOf(b.key),
      ),
    );

    for (const key of keys) {
      const file = byKey.get(key)!;
      const isVideo = kindOf(file.content_type) === 'video';

      if (isVideo) {
        // A film with no poster gets one now, once the media worker has its
        // length and its playback copy. Before that it would be a piece on a
        // feed with nothing to draw and nothing to play, so it is refused with
        // the one thing worth saying about it: wait a moment.
        const poster =
          file.poster_key ??
          (file.processing_status === 'ready' ? await this.posters.ensure(key) : null);
        if (!poster) {
          throw new BadRequestException({
            statusCode: 400,
            error: 'Bad Request',
            code: 'SHOWCASE_FILM_NOT_READY',
            message: 'That film is still being prepared. Try again in a moment.',
            // Which one, so the app can point at it.
            fileKey: key,
          });
        }
        continue;
      }

      if (file.thumb_key) continue;

      const size = Number(file.size_bytes);
      if (size > MAX_SOURCE_BYTES) {
        throw new BadRequestException({
          statusCode: 400,
          error: 'Bad Request',
          code: 'SHOWCASE_TOO_LARGE',
          message: 'That photo is too large to post. Choose one under 40 MB.',
          fileKey: key,
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
          fileKey: key,
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

    // A left join: a piece with its own copies is served from them, and needs
    // no album file at all. One without them is still served from its file,
    // and drops out as before if that file is gone.
    const pieces = await this.db.query<PieceRow>(
      `select i.id as item_id, i.showcase_id, i.user_id, i.file_key,
              i.copied_at, i.kind as own_kind, i.thumb_key as own_thumb_key,
              i.poster_key as own_poster_key, i.video_key as own_video_key,
              i.display_widths as own_widths, i.width_px as own_width_px,
              i.height_px as own_height_px, i.duration_ms as own_duration_ms,
              f.content_type, f.thumb_key, f.poster_key,
              f.proxy_key, f.hls_prefix, f.duration_ms, f.display_widths,
              f.width_px, f.height_px
         from showcase_items i
         left join user_files f on f.key = i.file_key and f.user_id = i.user_id
        where i.showcase_id = any($1::uuid[])
          and (i.copied_at is not null or f.key is not null)
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
      unpublishedAt: asIso(row.unpublished_at),
      hiddenAt: asIso(row.hidden_at),
      keptCount: Number(row.kept_count),
      likeCount: Number(row.like_count),
      commentCount: Number(row.comment_count),
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
    if (row.copied_at !== null) return this.presentCopied(row, forOwner);

    const fileKey = row.file_key;
    if (!fileKey) return null;
    // Both or neither: a half-known size is no size.
    const size =
      row.width_px && row.height_px ? { width: row.width_px, height: row.height_px } : {};
    if (row.content_type?.startsWith('video/')) {
      // A still to show, and somewhere to play from. The ladder once it is
      // built, the single proxy until then — the same order every player in
      // this app already falls through. Never the original: it can be HEVC,
      // ten-bit, or at edit-suite bitrate.
      const url = await this.storage.mediaUrl(row.poster_key, PUBLISHED_URL_TTL_SECONDS);
      if (!url) return null;
      return {
        fileKey,
        kind: 'video',
        url,
        playbackUrl:
          this.mediaLink.hlsUrl(row.hls_prefix) ?? this.mediaLink.url(row.proxy_key),
        durationMs: row.duration_ms === null ? null : Number(row.duration_ms),
        displaySources: [],
        ...size,
        ...(forOwner ? { publiclyShown: true } : {}),
      };
    }

    // The album's copies are named by their LONG edge. Said as widths, as the
    // apps read them: a portrait's "2048" is narrower than 2048, and taking
    // the label at its word picked copies too small for the screen.
    const portrait =
      row.width_px && row.height_px && row.height_px > row.width_px
        ? row.width_px / row.height_px
        : null;
    const displaySources = this.mediaLink
      .displaySources(fileKey, row.display_widths, PUBLISHED_URL_TTL_SECONDS)
      .map((source) =>
        portrait ? { ...source, width: Math.round(source.width * portrait) } : source,
      );

    if (forOwner) {
      const url = await this.storage.mediaUrl(
        row.thumb_key ?? fileKey,
        PUBLISHED_URL_TTL_SECONDS,
      );
      return {
        fileKey,
        kind: 'image',
        url: url ?? '',
        displaySources,
        ...size,
        publiclyShown: row.thumb_key !== null,
      };
    }

    const url = await this.storage.mediaUrl(row.thumb_key, PUBLISHED_URL_TTL_SECONDS);
    if (!url) return null;
    return { fileKey, kind: 'image', url, displaySources, ...size };
  }

  /**
   * A piece served from its own copies in the public bucket: permanent CDN
   * addresses, no album file needed, sized by real width.
   */
  private async presentCopied(row: PieceRow, forOwner: boolean): Promise<ShowcasePiece | null> {
    const key = pieceKeyOf({ id: row.item_id, file_key: row.file_key });
    const url = await this.storage.mediaUrl(row.own_thumb_key, PUBLISHED_URL_TTL_SECONDS);
    if (!url) return null;
    const size =
      row.own_width_px && row.own_height_px
        ? { width: row.own_width_px, height: row.own_height_px }
        : {};
    const owner = forOwner ? { publiclyShown: true } : {};

    if (row.own_kind === 'video') {
      const [poster, playback] = await Promise.all([
        this.storage.mediaUrl(row.own_poster_key, PUBLISHED_URL_TTL_SECONDS),
        this.storage.mediaUrl(row.own_video_key, PUBLISHED_URL_TTL_SECONDS),
      ]);
      return {
        fileKey: key,
        kind: 'video',
        url: poster ?? url,
        playbackUrl: playback,
        durationMs: row.own_duration_ms === null ? null : Number(row.own_duration_ms),
        displaySources: [],
        ...size,
        ...owner,
      };
    }

    const base = pieceBase(row.user_id, row.showcase_id, row.item_id);
    const widths = row.own_widths ?? [];
    const urls = await Promise.all(
      widths.map((width) =>
        this.storage.mediaUrl(`${base}-${width}.webp`, PUBLISHED_URL_TTL_SECONDS),
      ),
    );
    const displaySources = widths.flatMap((width, i) => {
      const at = urls[i];
      return at ? [{ width, url: at }] : [];
    });
    return { fileKey: key, kind: 'image', url, displaySources, ...size, ...owner };
  }
}

/**
 * A keyset cursor on (published_at, id), with the time as Postgres wrote it.
 *
 * As text, not a Date: a JavaScript date stops at milliseconds, and a
 * timestamptz does not. A cursor rounded down to the millisecond skipped any
 * post published within the same millisecond as the last one on the page.
 */
export function encodeShowcaseCursor(at: string, id: string): string {
  return Buffer.from(`${at}|${id}`, 'utf8').toString('base64url');
}

const CURSOR_TIME = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)?$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A cursor arrives from a client, so it is checked: a bad one is the first page. */
export function decodeShowcaseCursor(
  cursor: string | undefined,
): { at: string; id: string } | null {
  if (!cursor) return null;
  try {
    const [at, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
    if (!at || !id || !CURSOR_TIME.test(at) || !UUID.test(id)) return null;
    return { at, id };
  } catch {
    return null;
  }
}

/** Every object a stored piece's copies were written as, for deleting them. */
function copiesOf(piece: StoredPiece): (string | null)[] {
  const thumb = piece.thumb_key;
  return [
    thumb,
    piece.poster_key,
    piece.video_key,
    // The web copies sit beside the thumbnail, named by width.
    ...(thumb
      ? (piece.display_widths ?? []).map((width) =>
          thumb.replace(/-thumb\.webp$/, `-${width}.webp`),
        )
      : []),
  ];
}

/** Trimmed, empties dropped, duplicates dropped, order kept. */
function cleanTags(tags: string[] | undefined): string[] {
  if (!tags) return [];
  return [...new Set(tags.map((t) => t.trim()).filter((t) => t.length > 0))];
}
