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
  item_count: number;
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

    const userId = rows[0].user_id;
    const ids = rows.map((r) => r.id);

    const counts = await this.db.query<{ album_id: string; count: string }>(
      `select album_id, count(*)::text as count
         from user_files
        where user_id = $1 and album_id = any($2::text[])
        group by album_id`,
      [userId, ids],
    );

    // distinct on picks the first row of each album_id group given the order
    // below, i.e. the newest image — one query rather than one per album.
    const covers = await this.db.query<{ album_id: string; key: string }>(
      `select distinct on (album_id) album_id, key
         from user_files
        where user_id = $1
          and album_id = any($2::text[])
          and content_type like 'image/%'
        order by album_id, created_at desc`,
      [userId, ids],
    );

    const countById = new Map(counts.map((c) => [c.album_id, Number(c.count)]));
    const coverById = new Map(covers.map((c) => [c.album_id, c.key]));

    // Signed rather than public: the bucket is not world-readable, so a cover
    // is a time-limited URL like every other object.
    const coverUrls = await this.storage.mediaUrls(
      rows.map((row) => coverById.get(row.id) ?? null),
    );

    return rows.map((row, i) => ({
      ...row,
      item_count: countById.get(row.id) ?? 0,
      // An explicitly chosen cover always wins over the derived one.
      cover_url: row.cover_url ?? coverUrls[i],
    }));
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
