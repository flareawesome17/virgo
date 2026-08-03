import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { StorageConfig } from '../storage/storage.config';
import { AlbumShareService } from '../albums/share/album-share.service';

/**
 * How much work a profile can show.
 *
 * Not arbitrary: every item is a CDN image on a page that must stay fast for a
 * stranger on Philippine mobile data, and the whole point of a portfolio is
 * that it is edited. Twenty-four strong photographs say more than a hundred.
 */
export const MAX_IMAGES = 24;
export const MAX_ALBUMS = 12;

export interface PortfolioImage {
  id: string;
  kind: 'image';
  url: string;
  caption: string | null;
  /**
   * The object key behind `url`.
   *
   * Owner's list only — the editor needs it to know which uploads are already
   * on the profile, and deriving it by slicing the CDN URL would break the day
   * the CDN path changes. Omitted from the public payload: a stranger has the
   * URL and needs nothing more.
   */
  fileKey?: string;
}

export interface PortfolioAlbum {
  id: string;
  kind: 'album';
  name: string;
  caption: string | null;
  coverUrl: string | null;
  itemCount: number;
  /** The public gallery, on the share host. Never the client's own link. */
  url: string | null;
  /** Owner's list only, so the picker can hide albums already showcased. */
  albumId?: string;
}

export type PortfolioItem = PortfolioImage | PortfolioAlbum;

interface ItemRow {
  id: string;
  kind: 'image' | 'album';
  file_key: string | null;
  album_id: string | null;
  caption: string | null;
  album_name: string | null;
  album_cover_url: string | null;
  album_item_count: number | null;
  share_token: string | null;
  derived_cover_key: string | null;
}

@Injectable()
export class PortfolioService {
  constructor(
    private readonly db: DatabaseService,
    private readonly storage: StorageConfig,
    private readonly shares: AlbumShareService,
  ) {}

  /**
   * Everything a profile shows, in the owner's order.
   *
   * The joins are inner and carry `user_id` deliberately. A portfolio row is a
   * reference, and references go stale — a file can be deleted, an album can
   * change hands. Re-checking ownership here, in SQL, means a row that no
   * longer qualifies simply does not come back. Filtering in TypeScript after
   * the fetch would work until someone forgets, and the failure mode is a
   * public page showing media its owner no longer has any claim to.
   */
  async list(
    userId: string,
    { forOwner = false }: { forOwner?: boolean } = {},
  ): Promise<PortfolioItem[]> {
    const rows = await this.db.query<ItemRow>(
      `select p.id, p.kind, p.file_key, p.album_id, p.caption,
              a.name        as album_name,
              a.cover_url   as album_cover_url,
              a.item_count  as album_item_count,
              l.token       as share_token,
              (select f2.key
                 from user_files f2
                where f2.album_id = a.id
                  and f2.content_type like 'image/%'
                order by f2.created_at
                limit 1) as derived_cover_key
         from portfolio_items p
         left join user_files f
                on p.kind = 'image'
               and f.key = p.file_key
               and f.user_id = p.user_id
               and f.content_type like 'image/%'
         left join albums a
                on p.kind = 'album'
               and a.id = p.album_id
               and a.user_id = p.user_id
         left join album_share_links l
                on l.album_id = a.id
               and l.purpose = 'portfolio'
               and l.revoked_at is null
        where p.user_id = $1
          and ((p.kind = 'image' and f.key is not null)
            or (p.kind = 'album' and a.id is not null))
        order by p.position, p.created_at`,
      [userId],
    );

    return rows.map((row) => this.present(row, forOwner));
  }

  private present(row: ItemRow, forOwner: boolean): PortfolioItem {
    if (row.kind === 'image') {
      return {
        id: row.id,
        kind: 'image',
        url: this.storage.publicUrl(row.file_key!) ?? '',
        caption: row.caption,
        ...(forOwner ? { fileKey: row.file_key! } : {}),
      };
    }

    return {
      id: row.id,
      kind: 'album',
      name: row.album_name ?? 'Album',
      caption: row.caption,
      coverUrl:
        row.album_cover_url ??
        (row.derived_cover_key
          ? this.storage.publicUrl(row.derived_cover_key)
          : null),
      itemCount: row.album_item_count ?? 0,
      url: row.share_token ? this.shares.urlFor(row.share_token) : null,
      ...(forOwner ? { albumId: row.album_id! } : {}),
    };
  }

  /**
   * Adds one of the caller's own images.
   *
   * The ownership check is the whole security model here. `file_key` arrives
   * from the client, and keys are not secrets — they appear in CDN URLs. Insert
   * without checking and anyone can put another user's private photograph on
   * their own public, indexable profile, attributed to themselves.
   */
  async addImage(
    userId: string,
    fileKey: string,
    caption?: string,
  ): Promise<PortfolioItem[]> {
    const file = await this.db.queryOne<{ content_type: string | null }>(
      'select content_type from user_files where key = $1 and user_id = $2',
      [fileKey, userId],
    );
    // Same answer whether the file belongs to someone else or does not exist,
    // so this cannot be used to test whether a key is real.
    if (!file) throw new NotFoundException('File not found');

    if (!file.content_type?.startsWith('image/')) {
      throw new BadRequestException('Only images can go in a portfolio');
    }

    await this.assertRoom(userId, 'image', MAX_IMAGES);

    await this.db.query(
      `insert into portfolio_items (user_id, kind, file_key, caption, position)
       values ($1, 'image', $2, $3, $4)
       on conflict do nothing`,
      [userId, fileKey, caption?.trim() || null, await this.nextPosition(userId)],
    );

    return this.list(userId, { forOwner: true });
  }

  /**
   * Showcases one of the caller's own albums.
   *
   * Creates a share link with `purpose = 'portfolio'`, which is a different row
   * from whatever the client was sent. Revoking one leaves the other alone.
   */
  async addAlbum(
    userId: string,
    albumId: string,
    caption?: string,
  ): Promise<PortfolioItem[]> {
    const album = await this.db.queryOne<{ id: string }>(
      'select id from albums where id = $1 and user_id = $2',
      [albumId, userId],
    );
    if (!album) throw new NotFoundException('Album not found');

    await this.assertRoom(userId, 'album', MAX_ALBUMS);

    // Images only. A portfolio is a public shop window, and quietly publishing
    // the raw video and audio from a paid shoot is not what "show this album"
    // reads as to the person tapping it.
    await this.shares.createOrGet(userId, albumId, ['image'], 'portfolio');

    await this.db.query(
      `insert into portfolio_items (user_id, kind, album_id, caption, position)
       values ($1, 'album', $2, $3, $4)
       on conflict do nothing`,
      [userId, albumId, caption?.trim() || null, await this.nextPosition(userId)],
    );

    return this.list(userId, { forOwner: true });
  }

  /**
   * Removes an item.
   *
   * A showcased album also loses its portfolio share link — otherwise taking it
   * off the profile would leave a live public URL to it in the world, which is
   * the opposite of what removing it means.
   */
  async remove(userId: string, itemId: string): Promise<PortfolioItem[]> {
    const row = await this.db.queryOne<{ kind: string; album_id: string | null }>(
      `delete from portfolio_items
        where id = $1 and user_id = $2
        returning kind, album_id`,
      [itemId, userId],
    );
    if (!row) throw new NotFoundException('Item not found');

    if (row.kind === 'album' && row.album_id) {
      await this.shares.revoke(userId, row.album_id, 'portfolio');
    }

    return this.list(userId, { forOwner: true });
  }

  /** Reorders the portfolio. Ids that are not the caller's are ignored. */
  async reorder(userId: string, ids: string[]): Promise<PortfolioItem[]> {
    if (ids.length === 0) return this.list(userId);

    await this.db.query(
      `update portfolio_items p
          set position = v.position
         from (select unnest($2::uuid[]) as id,
                      generate_subscripts($2::uuid[], 1) as position) v
        where p.id = v.id and p.user_id = $1`,
      [userId, ids],
    );

    return this.list(userId, { forOwner: true });
  }

  private async nextPosition(userId: string): Promise<number> {
    const row = await this.db.queryOne<{ next: string }>(
      `select coalesce(max(position), -1) + 1 as next
         from portfolio_items where user_id = $1`,
      [userId],
    );
    return Number(row?.next ?? 0);
  }

  private async assertRoom(
    userId: string,
    kind: 'image' | 'album',
    max: number,
  ): Promise<void> {
    const row = await this.db.queryOne<{ count: string }>(
      'select count(*)::text as count from portfolio_items where user_id = $1 and kind = $2',
      [userId, kind],
    );
    if (Number(row?.count ?? 0) >= max) {
      throw new BadRequestException(
        kind === 'image'
          ? `A portfolio holds up to ${max} images. Remove one to add another.`
          : `You can showcase up to ${max} albums. Remove one to add another.`,
      );
    }
  }
}
