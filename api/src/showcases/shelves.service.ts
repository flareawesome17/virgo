import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { blockedBetween } from '../safety/block-sql';
import { PUBLISHED_URL_TTL_SECONDS } from '../storage/storage.config';
import { StorageService } from '../storage/storage.service';
import type { CreateShelfDto, KeepShowcaseDto, UpdateShelfDto } from './dto/showcase.dto';
import { ShowcasesService, connectedTo } from './showcases.service';

/**
 * Whether `viewer` may see a kept showcase `sc`, made by `mu`.
 *
 * Keeping asks once, as the keeper (ShowcasesService.one). But a shelf is read
 * by other people, later, and only publishing and suspension were asked then:
 * a public shelf showed connections-only posts to anyone who opened it, and
 * posts by people who had blocked the viewer. These are the same gates as
 * reading the showcase itself, asked on every read of the shelf — entries,
 * cover and count alike, so the three never disagree.
 */
const keptVisibleTo = (viewer: string, sc: string, mu: string): string => `(
  ${sc}.published_at is not null
  and ${sc}.unpublished_at is null
  and ${sc}.hidden_at is null
  and ${mu}.suspended_at is null
  and (${mu}.disabled_until is null or ${mu}.disabled_until <= now())
  and (${sc}.user_id = ${viewer}
       or (not ${blockedBetween(viewer, `${sc}.user_id`)}
           and (${sc}.visibility = 'public' or ${connectedTo(viewer, `${sc}.user_id`)})))
)`;

/**
 * Shelves: what somebody keeps of other people's work.
 *
 * The other half of a creative's presence. Their showcases say what they made;
 * their shelves say what they respond to, which is the thing a client is
 * actually reading a profile for.
 *
 * A shelf item is a POINTER — `shelf_items` has no file_key at all. Keeping
 * somebody's work never copies it, so an author who unpublishes or deletes
 * takes it off every shelf at once rather than having it survive out of reach.
 * The cascade in migration 071 is what enforces that, not this class.
 */

/** Enough to group by feeling without becoming a filing system. */
export const MAX_SHELVES = 40;

export interface ShelfSummary {
  id: string;
  name: string;
  isPublic: boolean;
  count: number;
  /** The most recently kept piece, for the shelf's face. Null on an empty one. */
  coverUrl: string | null;
  /**
   * Up to four stills, newest kept first, for a mosaic face: the cover piece
   * of each of the newest kept showcases this viewer can see. Empty on an
   * empty shelf. The first is the same piece as coverUrl.
   */
  coverUrls: string[];
  /**
   * Whether this shelf holds the showcase asked about, when one was. It is how
   * the Keep sheet knows where something is already kept, so it can be taken
   * off again — without it, keeping was a one-way door.
   */
  holds?: boolean;
}

export interface ShelfEntry {
  showcaseId: string;
  note: string | null;
  keptAt: string;
  /** Always present: a kept thing that cannot credit its maker is not shown. */
  maker: { id: string; displayName: string; handle: string | null };
  title: string | null;
  craftTags: string[];
  url: string;
}

/** How many stills a shelf's mosaic face draws. */
export const SHELF_COVER_TILES = 4;

/**
 * "All kept" answers this many at most. Forty shelves of somebody's taste is
 * rarely past a few hundred pieces; a page cursor can come when one is.
 */
export const MAX_ALL_KEPT = 500;

/**
 * A kept showcase's still, as one row with one column, `still`: its first
 * piece that has one. A photograph shows its thumbnail and a film its poster
 * frame; on a shelf tile they are the same thing. Its own copy first, its
 * album file's while that exists. Written against `sc`, the showcase.
 */
const coverStillOf = (sc: string): string => `(
  select coalesce(si.thumb_key, f.thumb_key, f.poster_key) as still
    from showcase_items si
    left join user_files f on f.key = si.file_key and f.user_id = si.user_id
   where si.showcase_id = ${sc}.id
     and coalesce(si.thumb_key, f.thumb_key, f.poster_key) is not null
   order by si.position, si.created_at
   limit 1
)`;

/**
 * One entry's columns, the same for a shelf and for All kept: the keep `i`,
 * the showcase `s`, its maker `u`.
 */
const ENTRY_COLUMNS = `i.showcase_id, i.note, i.created_at,
              u.id as maker_id, u.display_name,
              -- A handle is only a link once the profile is published: /profiles/:handle
              -- and hire both refuse an unpublished one, so handing it out made the
              -- avatar and Hire lead to "Profile not found".
              case when u.public_profile then u.handle end as handle,
              s.title, s.craft_tags,
              ${coverStillOf('s')} as thumb_key`;

interface EntryRow {
  showcase_id: string;
  note: string | null;
  created_at: Date | string;
  maker_id: string;
  display_name: string | null;
  handle: string | null;
  title: string | null;
  craft_tags: string[] | null;
  thumb_key: string | null;
}

const asIso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : v);

@Injectable()
export class ShelvesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly storage: StorageService,
    private readonly showcases: ShowcasesService,
  ) {}

  /**
   * Somebody's shelves.
   *
   * `viewerId === ownerId` is the owner looking at their own, which is the only
   * case that sees the private ones.
   */
  async list(viewerId: string, ownerId: string, holding?: string): Promise<ShelfSummary[]> {
    const own = viewerId === ownerId;
    const rows = await this.db.query<{
      id: string;
      name: string;
      is_public: boolean;
      count: string;
      cover_keys: string[] | null;
      holds: boolean | null;
    }>(
      `select sh.id, sh.name, sh.is_public,
              -- What this viewer will find inside, not every row: the count
              -- used to include pieces the shelf would never show them.
              (
                select count(*)
                  from shelf_items li
                  join showcases sc on sc.id = li.showcase_id
                  join users mu on mu.id = sc.user_id
                 where li.shelf_id = sh.id
                   and ${keptVisibleTo('$3', 'sc', 'mu')}
              )::text as count,
              -- The face: the stills of the newest kept showcases this viewer
              -- can see, newest first — its author may have taken others down
              -- since, or shown them to connections only. The first is the
              -- single cover older apps draw; the first four are the mosaic.
              -- A showcase with nothing to draw is passed over, not a gap.
              array(
                select st.still
                  from shelf_items li
                  join showcases sc on sc.id = li.showcase_id
                  join users mu on mu.id = sc.user_id
                  cross join lateral ${coverStillOf('sc')} st
                 where li.shelf_id = sh.id
                   and ${keptVisibleTo('$3', 'sc', 'mu')}
                 order by li.created_at desc, li.id desc
                 limit ${SHELF_COVER_TILES}
              ) as cover_keys,
              case when $4::uuid is null then null
                   else exists (
                     select 1 from shelf_items hi
                      where hi.shelf_id = sh.id and hi.showcase_id = $4::uuid
                   )
              end as holds
         from shelves sh
        where sh.user_id = $1 and ($2 or sh.is_public)
        order by sh.position, sh.created_at`,
      [ownerId, own, viewerId, holding ?? null],
    );

    return Promise.all(
      rows.map(async (r) => {
        const urls = await Promise.all(
          (r.cover_keys ?? []).map((key) =>
            this.storage.mediaUrl(key, PUBLISHED_URL_TTL_SECONDS),
          ),
        );
        const coverUrls = urls.filter((url): url is string => !!url);
        return {
          id: r.id,
          name: r.name,
          isPublic: r.is_public,
          count: Number(r.count),
          coverUrl: coverUrls[0] ?? null,
          coverUrls,
          ...(r.holds === null ? {} : { holds: r.holds }),
        };
      }),
    );
  }

  /**
   * Somebody's public shelves, by handle.
   *
   * Public ones only, whoever is asking — a shelf marked private is a research
   * tool, not something a visitor gets because they found the profile. The
   * account's gates are asked here too, so a suspended or blocked person's
   * taste is as absent as the rest of them.
   */
  async publicByHandle(viewerId: string, handle: string): Promise<ShelfSummary[]> {
    const owner = await this.db.queryOne<{ id: string }>(
      `select u.id from users u
        where lower(u.handle) = $1
          and u.suspended_at is null
          and (u.disabled_until is null or u.disabled_until <= now())
          and (u.public_profile = true or u.id = $2)
          and not exists (
            select 1 from user_blocks ub
             where (ub.blocker_id = $2 and ub.blocked_id = u.id)
                or (ub.blocker_id = u.id and ub.blocked_id = $2)
          )`,
      [handle.toLowerCase(), viewerId],
    );
    if (!owner) return [];
    return this.list(viewerId, owner.id);
  }

  /**
   * One shelf's contents.
   *
   * Every entry names its maker, always. An unpublished or deleted showcase is
   * simply not returned — the row may still be there, but the author's decision
   * is what decides whether it is shown, and that is checked here on every read
   * rather than swept up later.
   */
  async entries(viewerId: string, shelfId: string): Promise<ShelfEntry[]> {
    const shelf = await this.db.queryOne<{ user_id: string }>(
      `select user_id from shelves
        where id = $1 and (user_id = $2 or is_public)`,
      [shelfId, viewerId],
    );
    if (!shelf) throw new NotFoundException('Shelf not found');

    const rows = await this.db.query<EntryRow>(
      `select ${ENTRY_COLUMNS}
         from shelf_items i
         join showcases s on s.id = i.showcase_id
         join users u on u.id = s.user_id
        where i.shelf_id = $1
          and ${keptVisibleTo('$2', 's', 'u')}
        order by i.created_at desc`,
      [shelfId, viewerId],
    );
    return this.present(rows);
  }

  /**
   * Everything somebody has kept, on any of their shelves: the "All kept"
   * collection. Their own, so private shelves are in it.
   *
   * Once each: a showcase on three shelves is one entry, the newest keep's —
   * its note and when — and the list is newest first, as a shelf is. The
   * same gates as a shelf's, asked on every read, so something its author has
   * since taken down or narrowed to connections is not here either.
   */
  async allKept(userId: string): Promise<ShelfEntry[]> {
    const rows = await this.db.query<EntryRow>(
      `with latest as (
         select distinct on (k.showcase_id) k.id
           from shelf_items k
           join shelves sh on sh.id = k.shelf_id
          where k.user_id = $1 and sh.user_id = $1
          order by k.showcase_id, k.created_at desc, k.id desc
       )
       select ${ENTRY_COLUMNS}
         from latest
         join shelf_items i on i.id = latest.id
         join showcases s on s.id = i.showcase_id
         join users u on u.id = s.user_id
        where ${keptVisibleTo('$1', 's', 'u')}
        order by i.created_at desc, i.showcase_id desc
        limit ${MAX_ALL_KEPT}`,
      [userId],
    );
    return this.present(rows);
  }

  /** Entries as the apps read them. One with no web copy is dropped, not drawn as a gap. */
  private async present(rows: EntryRow[]): Promise<ShelfEntry[]> {
    const out: ShelfEntry[] = [];
    for (const r of rows) {
      const url = await this.storage.mediaUrl(r.thumb_key, PUBLISHED_URL_TTL_SECONDS);
      // No web copy, nothing to show. Dropped rather than rendered as a gap.
      if (!url) continue;
      out.push({
        showcaseId: r.showcase_id,
        note: r.note,
        keptAt: asIso(r.created_at),
        maker: {
          id: r.maker_id,
          displayName: r.display_name ?? 'Someone',
          handle: r.handle,
        },
        title: r.title,
        craftTags: r.craft_tags ?? [],
        url,
      });
    }
    return out;
  }

  async create(userId: string, dto: CreateShelfDto): Promise<ShelfSummary[]> {
    const count = await this.db.queryOne<{ count: string }>(
      'select count(*)::text as count from shelves where user_id = $1',
      [userId],
    );
    if (Number(count?.count ?? 0) >= MAX_SHELVES) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        code: 'SHELF_LIMIT',
        message: `You can have up to ${MAX_SHELVES} shelves.`,
      });
    }

    try {
      await this.db.query(
        `insert into shelves (user_id, name, is_public, position)
         values ($1, $2, $3, (select coalesce(max(position), -1) + 1 from shelves where user_id = $1))`,
        [userId, dto.name.trim(), dto.isPublic ?? true],
      );
    } catch (err) {
      throw this.asNameClash(err);
    }
    return this.list(userId, userId);
  }

  async update(userId: string, id: string, dto: UpdateShelfDto): Promise<ShelfSummary[]> {
    try {
      const updated = await this.db.query(
        `update shelves
            set name = coalesce($3, name),
                is_public = coalesce($4, is_public)
          where id = $1 and user_id = $2
          returning id`,
        [id, userId, dto.name?.trim() ?? null, dto.isPublic ?? null],
      );
      if (updated.length === 0) throw new NotFoundException('Shelf not found');
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw this.asNameClash(err);
    }
    return this.list(userId, userId);
  }

  /** Deletes the shelf and what was on it. Nobody's work is touched. */
  async remove(userId: string, id: string): Promise<ShelfSummary[]> {
    const gone = await this.db.query(
      'delete from shelves where id = $1 and user_id = $2 returning id',
      [id, userId],
    );
    if (gone.length === 0) throw new NotFoundException('Shelf not found');
    return this.list(userId, userId);
  }

  /**
   * Keep somebody's showcase.
   *
   * Reads it as this viewer first, through the showcases service, so everything
   * that hides a showcase — unpublished, taken down, connections-only, a block
   * either way — also stops it being kept. Without that, a shelf would be a way
   * to hold on to something you were not allowed to see.
   */
  async keep(userId: string, shelfId: string, dto: KeepShowcaseDto): Promise<ShelfEntry[]> {
    const shelf = await this.db.queryOne<{ id: string }>(
      'select id from shelves where id = $1 and user_id = $2',
      [shelfId, userId],
    );
    if (!shelf) throw new NotFoundException('Shelf not found');

    const showcase = await this.showcases.one(userId, dto.showcaseId);

    // kept_count ranks the feed, so keeping your own work would be a way to
    // promote it. A shelf is for other people's work in any case.
    if (showcase.userId === userId) {
      throw new BadRequestException('A shelf is for other people’s work.');
    }

    await this.db.query(
      `insert into shelf_items (shelf_id, showcase_id, user_id, note)
       values ($1, $2, $3, $4)
       on conflict (shelf_id, showcase_id) do update set note = excluded.note`,
      [shelfId, dto.showcaseId, userId, dto.note?.trim() || null],
    );

    return this.entries(userId, shelfId);
  }

  async unkeep(userId: string, shelfId: string, showcaseId: string): Promise<ShelfEntry[]> {
    const gone = await this.db.query(
      `delete from shelf_items i
        using shelves sh
        where i.shelf_id = sh.id
          and sh.id = $1 and sh.user_id = $2
          and i.showcase_id = $3
        returning i.id`,
      [shelfId, userId, showcaseId],
    );
    if (gone.length === 0) throw new NotFoundException('Not on this shelf');
    return this.entries(userId, shelfId);
  }

  /**
   * Which of these showcases this viewer has already kept.
   *
   * One lookup for a whole feed page, so a card can draw its Keep button in the
   * right state without a query each.
   */
  async keptAmong(userId: string, showcaseIds: string[]): Promise<string[]> {
    if (showcaseIds.length === 0) return [];
    const rows = await this.db.query<{ showcase_id: string }>(
      `select distinct showcase_id from shelf_items
        where user_id = $1 and showcase_id = any($2::uuid[])`,
      [userId, showcaseIds],
    );
    return rows.map((r) => r.showcase_id);
  }

  /** 23505 on shelves_user_name is two shelves of one name, not a server fault. */
  private asNameClash(err: unknown): Error {
    const code = (err as { code?: string } | null)?.code;
    if (code === '23505') {
      return new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        code: 'SHELF_NAME_TAKEN',
        message: 'You already have a shelf with that name.',
      });
    }
    return err as Error;
  }
}
