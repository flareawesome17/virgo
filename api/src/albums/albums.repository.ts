import { Injectable } from '@nestjs/common';
import { OwnedRepository, type ListOptions } from '../common/owned.repository';
import { DatabaseService } from '../database/database.service';
import { StorageService } from '../storage/storage.service';

export type AlbumStatus = 'draft' | 'review' | 'delivered';

export interface AlbumRow {
  id: string;
  user_id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  cover_url: string | null;
  /** A photograph in the album chosen as its cover, signed on every read. */
  cover_key: string | null;
  item_count: number;
  /** Derived: what the album holds, by kind, so a card can say "312 · 2 films". */
  counts?: { image: number; video: number; audio: number };
  status: AlbumStatus;
  retention_days: number | null;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class AlbumsRepository extends OwnedRepository<AlbumRow> {
  protected readonly table = 'albums';

  protected readonly writableColumns = [
    'id',
    'workspace_id',
    'name',
    'description',
    'cover_url',
    'cover_key',
    'item_count',
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
   * cannot drift.
   *
   * `cover_url` is only ever set if the user picks a cover explicitly, so
   * every album started life with a blank card. When it is null the newest
   * image in the album stands in, which is what the card was missing.
   */
  private async withDerivedFields(rows: AlbumRow[]): Promise<AlbumRow[]> {
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
    const covers = await this.db.query<{ album_id: string; key: string }>(
      `select distinct on (album_id) album_id, key
         from user_files
        where album_id = any($1::text[])
          and content_type like 'image/%'
        order by album_id, created_at desc`,
      [ids],
    );

    const countById = new Map(counts.map((c) => [c.album_id, c]));
    const coverById = new Map(covers.map((c) => [c.album_id, c.key]));

    // Signed rather than public: the bucket is not world-readable, so a cover
    // is a time-limited URL like every other object. A chosen photograph
    // first, then the newest image.
    const [chosenUrls, coverUrls] = await Promise.all([
      this.storage.mediaUrls(rows.map((row) => row.cover_key)),
      this.storage.mediaUrls(rows.map((row) => coverById.get(row.id) ?? null)),
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
    return `(
      user_id = $${paramIndex}
      or id in (
        select ca.album_id
          from collaborator_albums ca
          join collaborators c on c.id = ca.collaborator_id
         where c.collaborator_user_id = $${paramIndex}
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
    );
  }

  async findOne(userId: string, id: string): Promise<AlbumRow | null> {
    const row = await this.db.queryOne<AlbumRow>(
      `select * from albums where id = $2 and ${this.sharedClause(1)}`,
      [userId, id],
    );
    if (!row) return null;
    return (await this.withDerivedFields([row]))[0];
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
