import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { PUBLISHED_URL_TTL_SECONDS } from '../storage/storage.config';
import { StorageService } from '../storage/storage.service';
import type { CreateShelfDto, KeepShowcaseDto, UpdateShelfDto } from './dto/showcase.dto';
import { ShowcasesService } from './showcases.service';

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
  async list(viewerId: string, ownerId: string): Promise<ShelfSummary[]> {
    const own = viewerId === ownerId;
    const rows = await this.db.query<{
      id: string;
      name: string;
      is_public: boolean;
      count: string;
      cover_thumb_key: string | null;
    }>(
      `select sh.id, sh.name, sh.is_public,
              count(i.id)::text as count,
              (
                -- The newest kept piece that can still be shown: its author may
                -- have taken others down since.
                select f.thumb_key
                  from shelf_items li
                  join showcases sc on sc.id = li.showcase_id
                                   and sc.published_at is not null
                                   and sc.unpublished_at is null
                  join showcase_items si on si.showcase_id = sc.id
                  join user_files f on f.key = si.file_key and f.user_id = si.user_id
                 where li.shelf_id = sh.id and f.thumb_key is not null
                 order by li.created_at desc, si.position
                 limit 1
              ) as cover_thumb_key
         from shelves sh
         left join shelf_items i on i.shelf_id = sh.id
        where sh.user_id = $1 and ($2 or sh.is_public)
        group by sh.id
        order by sh.position, sh.created_at`,
      [ownerId, own],
    );

    return Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        name: r.name,
        isPublic: r.is_public,
        count: Number(r.count),
        coverUrl: await this.storage.mediaUrl(r.cover_thumb_key, PUBLISHED_URL_TTL_SECONDS),
      })),
    );
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

    const rows = await this.db.query<{
      showcase_id: string;
      note: string | null;
      created_at: Date | string;
      maker_id: string;
      display_name: string | null;
      handle: string | null;
      title: string | null;
      craft_tags: string[] | null;
      thumb_key: string | null;
    }>(
      `select i.showcase_id, i.note, i.created_at,
              u.id as maker_id, u.display_name, u.handle,
              s.title, s.craft_tags,
              (
                select f.thumb_key
                  from showcase_items si
                  join user_files f on f.key = si.file_key and f.user_id = si.user_id
                 where si.showcase_id = s.id and f.thumb_key is not null
                 order by si.position, si.created_at
                 limit 1
              ) as thumb_key
         from shelf_items i
         join showcases s on s.id = i.showcase_id
                         and s.published_at is not null
                         and s.unpublished_at is null
         join users u on u.id = s.user_id
                     and u.suspended_at is null
                     and (u.disabled_until is null or u.disabled_until <= now())
        where i.shelf_id = $1
        order by i.created_at desc`,
      [shelfId],
    );

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
      throw new BadRequestException(`You can have up to ${MAX_SHELVES} shelves.`);
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
      return new ConflictException('You already have a shelf with that name.');
    }
    return err as Error;
  }
}
