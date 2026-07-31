import { Injectable } from '@nestjs/common';
import { OwnedRepository, type ListOptions } from '../common/owned.repository';
import { DatabaseService } from '../database/database.service';
import { StorageConfig } from '../storage/storage.config';

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

  constructor(db: DatabaseService, private readonly storage: StorageConfig) {
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

    return rows.map((row) => {
      const key = coverById.get(row.id);
      return {
        ...row,
        item_count: countById.get(row.id) ?? 0,
        // An explicitly chosen cover always wins over the derived one.
        cover_url: row.cover_url ?? (key ? this.storage.publicUrl(key) : null),
      };
    });
  }

  async findAll(userId: string, options: ListOptions = {}): Promise<AlbumRow[]> {
    return this.withDerivedFields(await super.findAll(userId, options));
  }

  async findOne(userId: string, id: string): Promise<AlbumRow | null> {
    const row = await super.findOne(userId, id);
    if (!row) return null;
    return (await this.withDerivedFields([row]))[0];
  }
}
