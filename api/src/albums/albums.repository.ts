import { Injectable } from '@nestjs/common';
import { OwnedRepository, type ListOptions } from '../common/owned.repository';
import { DatabaseService } from '../database/database.service';
import type { ResolvedAccess } from '../quota/quota.service';
import { DISPLAY_URL_TTL_SECONDS } from '../storage/storage.config';
import { StorageService } from '../storage/storage.service';

export type AlbumStatus = 'draft' | 'review' | 'delivered';

/** A photograph that could be an album's cover. */
interface CoverFile {
  key: string;
  thumb_key: string | null;
}

/**
 * What a card draws for a cover: the photograph's thumbnail, or the original
 * while there is none — still being processed, or too large to thumbnail.
 *
 * Covers were drawn from the original, several megabytes from a camera, so the
 * album list downloaded a dozen whole photographs to fill a dozen cards. The
 * thumbnail is 640 px of WebP, tens of kilobytes. The price is paid where a
 * cover is drawn much wider than a card — the phone's home banner and its
 * audio player's artwork — which 640 px fills a little soft.
 */
function shownKey(file: CoverFile): string {
  return file.thumb_key ?? file.key;
}

export interface AlbumRow {
  id: string;
  user_id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  cover_url: string | null;
  /** A photograph in the album chosen as its cover, signed on every read. */
  cover_key: string | null;
  /**
   * Derived: every file in the album, counted on every read. The column of
   * the same name is a leftover that nothing writes, so nothing should read
   * it either (see `withDerivedFields`).
   */
  item_count: number;
  /** Derived: what the album holds, by kind, so a card can say "312 · 2 films". */
  counts?: { image: number; video: number; audio: number };
  /** Derived: members of its workspace who can open it. 0 is "Private". */
  shared_with?: number;
  /** Derived: invitations not yet answered that would give it. */
  offered_to?: number;
  /**
   * Derived: what the person reading can do with it — 'owner', their grant,
   * or null. Lets a screen offer Upload only to someone who can.
   */
  my_access?: ResolvedAccess;
  status: AlbumStatus;
  retention_days: number | null;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class AlbumsRepository extends OwnedRepository<AlbumRow> {
  protected readonly table = 'albums';

  // Not `item_count`. It is counted from the album's files on every read, and
  // leaving it writable let a client store a number that every reader of the
  // column then repeated: mobile's create screen still posts `item_count: 0`.
  protected readonly writableColumns = [
    'id',
    'workspace_id',
    'name',
    'description',
    'cover_url',
    'cover_key',
    'status',
    'retention_days',
  ];

  protected readonly filterableColumns = ['workspace_id', 'status'];
  protected readonly sortableColumns = ['created_at', 'updated_at', 'name'];

  constructor(db: DatabaseService, private readonly storage: StorageService) {
    super(db);
  }

  /**
   * Fills in the two fields that cannot be trusted as stored.
   *
   * `item_count` was a counter the client incremented after each upload, so it
   * drifted the moment anything failed, was deleted, or uploaded without an
   * album — one album read 24 items while holding 5 files. Counting rows
   * cannot drift. The clients stopped incrementing it when this took over and
   * nothing else ever did, so the column reads 0 for every album made since.
   * Anything that shows how much an album holds counts the files, as here.
   *
   * `cover_url` is only ever set if the user picks a cover explicitly, so
   * every album started life with a blank card. When it is null the newest
   * image in the album stands in, which is what the card was missing.
   */
  private async withDerivedFields(rows: AlbumRow[], viewerId?: string): Promise<AlbumRow[]> {
    if (rows.length === 0) return rows;

    const ids = rows.map((r) => r.id);

    // By album alone. These used to be scoped to the FIRST row's owner, which
    // is only right while every row has the same one — a list holding your
    // albums and one shared with you counted the shared album as empty and
    // gave it no cover. An album's files are all billed to its owner, so the
    // album id is already the whole question.
    const counts = await this.db.query<{
      album_id: string;
      count: string;
      image: string;
      video: string;
      audio: string;
    }>(
      `select album_id, count(*)::text as count,
              count(*) filter (where content_type like 'image/%')::text as image,
              count(*) filter (where content_type like 'video/%')::text as video,
              count(*) filter (where content_type like 'audio/%')::text as audio
         from user_files
        where album_id = any($1::text[])
        group by album_id`,
      [ids],
    );

    // distinct on picks the first row of each album_id group given the order
    // below, i.e. the newest image — one query rather than one per album.
    const covers = await this.db.query<CoverFile & { album_id: string }>(
      `select distinct on (album_id) album_id, key, thumb_key
         from user_files
        where album_id = any($1::text[])
          and content_type like 'image/%'
        order by album_id, created_at desc`,
      [ids],
    );

    // A chosen cover is stored as the photograph's own key, so its thumbnail
    // has to be looked up. The foreign key on cover_key means the row exists.
    const chosenKeys = rows.flatMap((row) => (row.cover_key ? [row.cover_key] : []));
    const chosen = chosenKeys.length
      ? await this.db.query<CoverFile>(
          `select key, thumb_key from user_files where key = any($1::text[])`,
          [chosenKeys],
        )
      : [];

    // Who else can open each one, and what the reader can do with it. Only
    // grants from the album's own workspace count: a grant is access through
    // membership of that workspace, and nothing else.
    const grants = await this.db.query<{
      album_id: string;
      shared_with: string;
      offered_to: string;
      mine: ResolvedAccess;
    }>(
      `select ca.album_id,
              count(*) filter (where c.status = 'accepted')::text as shared_with,
              count(*) filter (where c.status = 'pending')::text as offered_to,
              max(ca.media_access) filter (
                where c.status = 'accepted' and c.collaborator_user_id = $2
              ) as mine
         from collaborator_albums ca
         join collaborators c on c.id = ca.collaborator_id
         join albums a on a.id = ca.album_id and a.workspace_id = c.workspace_id
        where ca.album_id = any($1::text[])
        group by ca.album_id`,
      [ids, viewerId ?? null],
    );

    const countById = new Map(counts.map((c) => [c.album_id, c]));
    const coverById = new Map(covers.map((c) => [c.album_id, shownKey(c)]));
    const grantsById = new Map(grants.map((g) => [g.album_id, g]));
    const chosenByKey = new Map(chosen.map((c) => [c.key, shownKey(c)]));

    // Signed rather than public: the bucket is not world-readable, so a cover
    // is a time-limited URL like every other object. A chosen photograph
    // first, then the newest image.
    //
    // Display-length, as the thumbnails inside the album are. A cover is only
    // ever shown, and under the one-hour default its URL changed every five
    // minutes, so coming back to the album list a little later downloaded
    // every card again.
    const [chosenUrls, coverUrls] = await Promise.all([
      this.storage.mediaUrls(
        rows.map((row) =>
          row.cover_key ? (chosenByKey.get(row.cover_key) ?? row.cover_key) : null,
        ),
        DISPLAY_URL_TTL_SECONDS,
      ),
      this.storage.mediaUrls(
        rows.map((row) => coverById.get(row.id) ?? null),
        DISPLAY_URL_TTL_SECONDS,
      ),
    ]);

    return rows.map((row, i) => ({
      ...row,
      item_count: Number(countById.get(row.id)?.count ?? 0),
      counts: {
        image: Number(countById.get(row.id)?.image ?? 0),
        video: Number(countById.get(row.id)?.video ?? 0),
        audio: Number(countById.get(row.id)?.audio ?? 0),
      },
      // An explicitly chosen cover always wins over the derived one.
      cover_url: chosenUrls[i] ?? row.cover_url ?? coverUrls[i],
      shared_with: Number(grantsById.get(row.id)?.shared_with ?? 0),
      offered_to: Number(grantsById.get(row.id)?.offered_to ?? 0),
      my_access:
        viewerId === undefined
          ? null
          : row.user_id === viewerId
            ? 'owner'
            : (grantsById.get(row.id)?.mine ?? null),
    }));
  }

  /** Whether `key` is a photograph in this album — the only thing a cover can be. */
  async isAlbumImage(albumId: string, key: string): Promise<boolean> {
    const row = await this.db.queryOne<{ key: string }>(
      `select key from user_files
        where key = $1 and album_id = $2 and content_type like 'image/%'`,
      [key, albumId],
    );
    return !!row;
  }

  /**
   * Albums visible to the user: their own, plus the ones they have been
   * granted through an accepted workspace invitation.
   *
   * Access is a row that must be present, not one that must be absent. It used
   * to be the other way round — every album in the workspace, minus
   * exclusions — which meant creating an album silently handed it to everyone
   * already in that workspace. A workspace holds more than one client's work,
   * so that was a decision being made by default rather than by the owner.
   *
   * Both halves are still required. The grant says which albums; the accepted
   * status says the person agreed to be there at all. Checking only the grant
   * would show a workspace to someone who never answered the invitation.
   */
  private sharedClause(paramIndex: number): string {
    // The collaborator row has to be in the album's own workspace. A grant
    // from elsewhere is one left behind by a move, and was listing the album
    // to people who could no longer open anything in it.
    return `(
      user_id = $${paramIndex}
      or exists (
        select 1
          from collaborator_albums ca
          join collaborators c on c.id = ca.collaborator_id
         where ca.album_id = albums.id
           and c.workspace_id = albums.workspace_id
           and c.collaborator_user_id = $${paramIndex}
           and c.status = 'accepted'
      )
    )`;
  }

  /**
   * Matches the album's name or description, or its workspace's name — the
   * three things someone looking for "the Reyes one" might remember.
   *
   * The term is bound, and its LIKE wildcards escaped, so typing a percent
   * sign searches for a percent sign.
   */
  private searchClause(term: unknown, params: unknown[]): string {
    if (typeof term !== 'string' || !term.trim()) return '';
    params.push(`%${term.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    const p = `$${params.length}`;
    return ` and (
      name ilike ${p}
      or coalesce(description, '') ilike ${p}
      or workspace_id in (select w.id from workspaces w where w.name ilike ${p})
    )`;
  }

  async findAll(userId: string, options: ListOptions = {}): Promise<AlbumRow[]> {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
    const offset = Math.max(options.offset ?? 0, 0);
    const orderBy = this.sortableColumns.includes(options.orderBy ?? '')
      ? (options.orderBy as string)
      : 'created_at';
    const direction = options.direction === 'asc' ? 'ASC' : 'DESC';

    const params: unknown[] = [userId];
    let where = this.sharedClause(1);

    // Only workspace_id and status are filterable; both are safe to compare.
    for (const column of ['workspace_id', 'status'] as const) {
      const value = options.filters?.[column];
      if (value === undefined || value === null) continue;
      params.push(value);
      where += ` and ${column} = $${params.length}`;
    }
    where += this.searchClause(options.filters?.search, params);

    params.push(limit, offset);

    return this.withDerivedFields(
      await this.db.query<AlbumRow>(
        `select * from albums
          where ${where}
          order by ${orderBy} ${direction}
          limit $${params.length - 1} offset $${params.length}`,
        params,
      ),
      userId,
    );
  }

  async findOne(userId: string, id: string): Promise<AlbumRow | null> {
    const row = await this.db.queryOne<AlbumRow>(
      `select * from albums where id = $2 and ${this.sharedClause(1)}`,
      [userId, id],
    );
    if (!row) return null;
    return (await this.withDerivedFields([row], userId))[0];
  }

  /**
   * Create and update answer with the album as a read would.
   *
   * The base returns the row as stored (`returning *`): the unused column's
   * count, 0 for any album made since August 2026, no `counts`, and a null
   * cover straight after a photograph was chosen. Both apps put an edited album
   * straight into their cache. And once the column is dropped, the stored row
   * has no `item_count` at all.
   */
  async create(userId: string, data: Record<string, unknown>): Promise<AlbumRow> {
    const [created] = await this.withDerivedFields([await super.create(userId, data)], userId);
    return created;
  }

  async update(
    userId: string,
    id: string,
    data: Record<string, unknown>,
  ): Promise<AlbumRow | null> {
    const updated = await super.update(userId, id, data);
    return updated && (await this.withDerivedFields([updated], userId))[0];
  }

  /**
   * Must match findAll's visibility.
   *
   * The inherited count is owner-only, so a collaborator saw their shared
   * albums listed under a total of 0.
   */
  async count(
    userId: string,
    filters: Record<string, unknown> = {},
  ): Promise<number> {
    const params: unknown[] = [userId];
    let where = this.sharedClause(1);
    where += this.searchClause(filters.search, params);

    for (const column of ['workspace_id', 'status'] as const) {
      const value = filters[column];
      if (value === undefined || value === null) continue;
      params.push(value);
      where += ` and ${column} = $${params.length}`;
    }

    const row = await this.db.queryOne<{ count: string }>(
      `select count(*)::text as count from albums where ${where}`,
      params,
    );
    return Number(row?.count ?? 0);
  }
}
