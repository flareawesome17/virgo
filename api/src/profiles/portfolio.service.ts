import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { MediaLinkService } from '../storage/media-link.service';
import { PUBLISHED_URL_TTL_SECONDS } from '../storage/storage.config';
import { StorageService } from '../storage/storage.service';
import { MAX_SOURCE_BYTES, ThumbnailsService } from '../storage/thumbnails.service';
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

/**
 * A profile photo or cover: never something to put on a portfolio.
 *
 * Both belong to the profile, not the portfolio. Changing either deletes the
 * old object (discardAvatar, discardCover and the cover sweep), and a tile
 * made from one would vanish with it, unannounced. Neither has a thumbnail
 * either, and making one here would put a second copy of it in the public
 * bucket.
 */
const PROFILE_PHOTO_KEY = /^users\/[^/]+\/(avatars|covers)\//;

export interface PortfolioImage {
  id: string;
  kind: 'image';
  /**
   * The signed 640 px WebP thumbnail on B2, never the original.
   *
   * The camera file carries its EXIF, GPS included, and a public profile is
   * the last place it belongs. The thumbnail is a re-encode, so none of that
   * survives it. It stays on the B2 host because the deployed web's
   * next/image allows that host and not the media one.
   *
   * The owner's own editor is the exception: it falls back to the original
   * for a photograph with no thumbnail, so it can still be recognised and
   * removed. `publiclyShown` says which those are.
   */
  url: string;
  caption: string | null;
  /**
   * The 1024 and 2048 copies on the media host, narrowest first, when they
   * exist. Possibly empty. Not for next/image, whose allow-list lacks that
   * host.
   */
  displaySources: { width: number; url: string }[];
  /**
   * The object key behind `url`.
   *
   * Owner's list only — the editor needs it to know which uploads are already
   * on the profile, and deriving it by slicing the CDN URL would break the day
   * the CDN path changes. Omitted from the public payload: a stranger has the
   * URL and needs nothing more.
   */
  fileKey?: string;
  /**
   * Owner's list only. False for a photograph the public page leaves out
   * because it has no thumbnail, so the editor can say so.
   */
  publiclyShown?: boolean;
}

export interface PortfolioAlbum {
  id: string;
  kind: 'album';
  name: string;
  caption: string | null;
  coverUrl: string | null;
  /**
   * The photographs in the album, counted on every read. Photographs only,
   * because that is all the gallery at `url` shows (see `addAlbum`).
   */
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
  /** A single photograph's own thumbnail and display copies. */
  image_thumb_key: string | null;
  image_display_widths: number[] | null;
  album_name: string | null;
  /** A cover stored as a URL, from before covers were chosen by key. */
  album_cover_url: string | null;
  /** As text: `count(*)` is a bigint, which the driver hands back as a string. */
  album_photo_count: string;
  share_token: string | null;
  /** The photograph chosen as the cover, while it is still in the album. */
  chosen_cover_key: string | null;
  chosen_cover_thumb_key: string | null;
  /** The album's newest photograph, which stands in when none was chosen. */
  derived_cover_key: string | null;
  derived_cover_thumb_key: string | null;
}

/**
 * What the owner's editor draws for a photograph: its thumbnail, or the
 * original while there is none — still being processed, or too large to
 * thumbnail.
 *
 * The same rule as the app's album cards (`shownKey` in albums.repository.ts).
 * The public page never takes the second half of it: signing the original
 * sent a stranger a whole camera file, EXIF and all, for every card.
 */
function shownKey(key: string | null, thumbKey: string | null): string | null {
  return thumbKey ?? key;
}

@Injectable()
export class PortfolioService {
  constructor(
    private readonly db: DatabaseService,
    private readonly storage: StorageService,
    private readonly shares: AlbumShareService,
    private readonly mediaLink: MediaLinkService,
    private readonly thumbs: ThumbnailsService,
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
   *
   * Album covers follow the app's album cards (`withDerivedFields` in
   * albums.repository.ts), and the two have to keep agreeing. Both candidates
   * come back from here: the photograph the owner chose, and the album's
   * newest. The chosen one is re-checked as still being in the album — one
   * moved out of it is a stale reference like any other. Being in this user's
   * album is the ownership check for both, because an album's files are
   * billed to its owner, whoever uploaded them.
   *
   * The photograph count is scoped the same way: the album's own rows,
   * counted. It used to be `albums.item_count`, a counter the app bumped
   * after each upload that nothing kept true, which the app's cards stopped
   * trusting for the same reason.
   *
   * A single photograph reaches the public list only through its thumbnail,
   * so one without is filtered out here, in SQL, rather than signed as the
   * original. The owner's list keeps it, flagged, so the editor can say why
   * the public page is one short.
   */
  async list(
    userId: string,
    { forOwner = false }: { forOwner?: boolean } = {},
  ): Promise<PortfolioItem[]> {
    const rows = await this.db.query<ItemRow>(
      `select p.id, p.kind, p.file_key, p.album_id, p.caption,
              f.thumb_key      as image_thumb_key,
              f.display_widths as image_display_widths,
              a.name        as album_name,
              a.cover_url   as album_cover_url,
              (select count(*)::text
                 from user_files f3
                where f3.album_id = a.id
                  and f3.content_type like 'image/%') as album_photo_count,
              l.token       as share_token,
              c.key         as chosen_cover_key,
              c.thumb_key   as chosen_cover_thumb_key,
              d.key         as derived_cover_key,
              d.thumb_key   as derived_cover_thumb_key
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
         left join user_files c
                on c.key = a.cover_key
               and c.album_id = a.id
               and c.content_type like 'image/%'
         left join lateral (
               select f2.key, f2.thumb_key
                 from user_files f2
                where f2.album_id = a.id
                  and f2.content_type like 'image/%'
                order by f2.created_at desc
                limit 1) d on true
        where p.user_id = $1
          and ((p.kind = 'image' and f.key is not null
                -- The public page shows a photograph only through its EXIF-free copy.
                and ($2::boolean or f.thumb_key is not null))
            or (p.kind = 'album' and a.id is not null))
        order by p.position, p.created_at`,
      [userId, forOwner],
    );

    const items = await Promise.all(rows.map((row) => this.present(row, forOwner)));
    return items.filter((item): item is PortfolioItem => item !== null);
  }

  /**
   * How many of the owner's photographs the public page leaves out.
   *
   * The ones with no thumbnail: the same test `list` filters on, counted, so
   * the owner's page can say how many are missing from what visitors see.
   */
  async hiddenCount(userId: string): Promise<number> {
    const row = await this.db.queryOne<{ n: number }>(
      `select count(*)::int as n
         from portfolio_items p
         join user_files f
           on f.key = p.file_key
          and f.user_id = p.user_id
          and f.content_type like 'image/%'
        where p.user_id = $1
          and p.kind = 'image'
          and f.thumb_key is null`,
      [userId],
    );
    return Number(row?.n ?? 0);
  }

  /**
   * A published profile is open to every signed-in account, so these URLs are
   * signed on the strength of the profile being published rather than of who
   * is asking.
   *
   * The long TTL matters more here than anywhere else: a profile page is
   * rendered once and then looked at, and a cached copy keeps serving
   * whatever URL was in it. A short expiry turns into a broken photograph on
   * the one page whose whole job is to look good.
   *
   * Null leaves an item off the public list: a photograph whose thumbnail
   * cannot be signed has nothing it may be shown as.
   */
  private async present(row: ItemRow, forOwner: boolean): Promise<PortfolioItem | null> {
    if (row.kind === 'image') {
      // The thumbnail and never the original, on the public list. It is a
      // re-encode, so the camera's EXIF and GPS do not survive it, and 640 px
      // is enough for a tile and for the blurred banner the first photograph
      // becomes. The larger copies ride along for clients that can use the
      // media host.
      const displaySources = this.mediaLink.displaySources(
        row.file_key!,
        row.image_display_widths,
        PUBLISHED_URL_TTL_SECONDS,
      );
      if (forOwner) {
        // The owner's own editor may fall back to the original: it is their
        // file, and the tile has to be recognisable to be removed.
        return {
          id: row.id,
          kind: 'image',
          url:
            (await this.storage.mediaUrl(
              row.image_thumb_key ?? row.file_key!,
              PUBLISHED_URL_TTL_SECONDS,
            )) ?? '',
          caption: row.caption,
          displaySources,
          fileKey: row.file_key!,
          publiclyShown: row.image_thumb_key !== null,
        };
      }
      const url = await this.storage.mediaUrl(row.image_thumb_key, PUBLISHED_URL_TTL_SECONDS);
      if (!url) return null;
      return { id: row.id, kind: 'image', url, caption: row.caption, displaySources };
    }

    return {
      id: row.id,
      kind: 'album',
      name: row.album_name ?? 'Album',
      caption: row.caption,
      coverUrl: forOwner ? await this.ownerCover(row) : await this.publicCover(row),
      itemCount: Number(row.album_photo_count),
      url: row.share_token ? this.shares.urlFor(row.share_token) : null,
      ...(forOwner ? { albumId: row.album_id! } : {}),
    };
  }

  /**
   * An album card's cover on the public page: a thumbnail or nothing.
   *
   * The chosen photograph's, then the newest one's. Never an original, and
   * never the legacy stored `cover_url`, which predates thumbnails and can
   * point at one. A card with no cover draws its placeholder.
   */
  private async publicCover(row: ItemRow): Promise<string | null> {
    return (
      (await this.storage.mediaUrl(row.chosen_cover_thumb_key, PUBLISHED_URL_TTL_SECONDS)) ??
      (await this.storage.mediaUrl(row.derived_cover_thumb_key, PUBLISHED_URL_TTL_SECONDS)) ??
      null
    );
  }

  /**
   * The same card in the owner's editor, in the app's own order: the
   * photograph its owner chose, then a cover stored as a URL before covers
   * were chosen by key, then the newest photograph — each from its thumbnail
   * while it has one.
   */
  private async ownerCover(row: ItemRow): Promise<string | null> {
    return (
      (await this.storage.mediaUrl(
        shownKey(row.chosen_cover_key, row.chosen_cover_thumb_key),
        PUBLISHED_URL_TTL_SECONDS,
      )) ??
      row.album_cover_url ??
      (await this.storage.mediaUrl(
        shownKey(row.derived_cover_key, row.derived_cover_thumb_key),
        PUBLISHED_URL_TTL_SECONDS,
      ))
    );
  }

  /**
   * Adds one of the caller's own images.
   *
   * The ownership check is the whole security model here. `file_key` arrives
   * from the client, and keys are not secrets — they appear in CDN URLs. Insert
   * without checking and anyone can put another user's private photograph on
   * their own public, indexable profile, attributed to themselves.
   *
   * A photograph arrives with its thumbnail or not at all. The public page
   * shows it only through that copy, so one that has none yet — a GIF or an
   * image from before thumbnails were always made, say — gets one made here,
   * and one that cannot be made is refused with a sentence the person can act
   * on, rather than added as a tile nobody else will ever see.
   */
  async addImage(
    userId: string,
    fileKey: string,
    caption?: string,
  ): Promise<PortfolioItem[]> {
    if (PROFILE_PHOTO_KEY.test(fileKey)) {
      throw new BadRequestException('Choose a photo from your uploads.');
    }

    const file = await this.db.queryOne<{
      content_type: string | null;
      size_bytes: string | number;
      thumb_key: string | null;
      display_widths: number[] | null;
      blur_data_url: string | null;
    }>(
      `select content_type, size_bytes, thumb_key, display_widths, blur_data_url
         from user_files where key = $1 and user_id = $2`,
      [fileKey, userId],
    );
    // Same answer whether the file belongs to someone else or does not exist,
    // so this cannot be used to test whether a key is real.
    if (!file) throw new NotFoundException('File not found');

    if (!file.content_type?.startsWith('image/')) {
      throw new BadRequestException('Only images can go in a portfolio');
    }

    await this.assertRoom(userId, 'image', MAX_IMAGES);

    if (!file.thumb_key) {
      const size = Number(file.size_bytes);
      if (size > MAX_SOURCE_BYTES) {
        throw new BadRequestException({
          statusCode: 400,
          error: 'Bad Request',
          code: 'PORTFOLIO_TOO_LARGE',
          message: 'That photo is too large to show on your profile. Choose one under 40 MB.',
        });
      }
      const made = await this.thumbs.generate(fileKey, file.content_type, size, {
        displayWidths: file.display_widths,
        blurDataUrl: file.blur_data_url,
      });
      if (!made) {
        throw new BadRequestException({
          statusCode: 400,
          error: 'Bad Request',
          code: 'PORTFOLIO_NO_WEB_COPY',
          message: "That photo can't be shown on your profile. Try a JPEG or PNG copy of it.",
        });
      }
    }

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

  /**
   * Reorders the portfolio. Ids that are not the caller's are ignored.
   *
   * Always answers with the owner's list, the empty case included: the
   * editor's cache is written from this response, and the public list would
   * drop the keys it matches on and every photograph it leaves out.
   */
  async reorder(userId: string, ids: string[]): Promise<PortfolioItem[]> {
    if (ids.length === 0) return this.list(userId, { forOwner: true });

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
