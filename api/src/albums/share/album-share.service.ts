import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { DatabaseService } from '../../database/database.service';
import { PUBLISHED_URL_TTL_SECONDS } from '../../storage/storage.config';
import { MediaLinkService } from '../../storage/media-link.service';
import { StorageService } from '../../storage/storage.service';
import {
  decodeFileCursor,
  encodeFileCursor,
} from '../../quota/quota.service';

export interface ShareLinkRow {
  id: string;
  album_id: string;
  user_id: string;
  token: string;
  media_kinds: MediaKind[];
  expires_at: Date | null;
  revoked_at: Date | null;
  purpose: SharePurpose;
  created_at: Date;
}

/**
 * Who a link was made for.
 *
 * 'client' is the delivery URL sent to the person who commissioned the work.
 * 'portfolio' is the one a public profile points at. Keeping them apart is what
 * stops publishing a profile from also publishing a client's private gallery.
 */
export type SharePurpose = 'client' | 'portfolio';

/** Which media a link exposes. Matches the leading part of the content type. */
export type MediaKind = 'image' | 'video' | 'audio';

export const ALL_MEDIA_KINDS: MediaKind[] = ['image', 'video', 'audio'];

export interface PublicAlbumView {
  album: { name: string; description: string | null };
  files: {
    /** Full-size, for viewing and playback. */
    url: string | null;
    /**
     * Small WebP for the grid, or null when one was never made.
     *
     * Null is a normal state, not an error — see ThumbnailsService. The page
     * falls back to `url`, which is what it always used to render.
     */
    thumbUrl: string | null;
    posterUrl: string | null;
    /**
     * The web-playable copy on the media host, or null when there is not one.
     *
     * Null is normal rather than an error — a film still encoding, an audio
     * file, or a deployment with no media host configured. The page falls
     * back to `url`, which is what it rendered before this existed.
     */
    proxyUrl: string | null;
    /** Same object, signed to save rather than open. */
    downloadUrl: string | null;
    /** What it saves as: "Album Name - 004.jpg". */
    downloadName: string;
    contentType: string | null;
    sizeBytes: number;
    originalName: string;
    width: number | null;
    height: number | null;
    durationMs: number | null;
    mediaTitle: string | null;
    mediaArtist: string | null;
    processingStatus: 'pending' | 'ready' | 'failed' | 'not_required';
  }[];
  /** Sections the link is scoped to, so the page renders only those. */
  kinds: MediaKind[];
  /** Every byte the link covers, for the "Download all" button to declare. */
  totalBytes: number;
  total: number;
  nextCursor: string | null;
  counts: Record<MediaKind, number>;
}

/**
 * Strips what a filesystem will not take, so a download never lands as
 * "Reyes/Santos — Wedding.zip" and silently becomes a folder.
 */
export function safeFileStem(name: string): string {
  return (
    name
      // Includes the backslash: a Windows client unzipping "A\B - 001.jpg"
      // gets a folder called A, not a file.
      .replace(/[/\\?%*:|"<>]/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || 'Album'
  );
}

/**
 * Sequential names for delivered files: "Reyes Wedding - 007.jpg".
 *
 * `user_files` stores no original filename — only a UUID key — so there is
 * nothing to preserve. Sequential numbering is what a delivery gallery wants
 * anyway: a client who downloads 200 photos gets them in the order they were
 * shown, rather than a pile of IMG_4821.JPG, and the album name is on every
 * file once it leaves the zip.
 */
export function deliveryName(
  albumName: string,
  index: number,
  key: string,
): string {
  const ext = /\.([a-z0-9]{1,5})$/i.exec(key)?.[1]?.toLowerCase() ?? 'bin';
  return `${safeFileStem(albumName)} - ${String(index + 1).padStart(3, '0')}.${ext}`;
}

/**
 * Public share links for albums.
 *
 * The token is the entire credential, so it is 32 bytes from a CSPRNG rather
 * than anything derived from the album id — a guessable or enumerable token
 * would expose other people's media.
 */
@Injectable()
export class AlbumShareService {
  constructor(
    private readonly db: DatabaseService,
    private readonly storage: StorageService,
    private readonly mediaLink: MediaLinkService,
    private readonly config: ConfigService,
  ) {}

  /** base64url of 32 random bytes — 256 bits, not enumerable. */
  private newToken(): string {
    return randomBytes(32).toString('base64url');
  }

  /**
   * Where a share token is served: client.virgo.ph, the public delivery host.
   *
   * Three names, tried in order, because this value predates having a word for
   * it. `CLIENT_DELIVERY_URL` says what it is and is what new deployments
   * should set; `PUBLIC_APP_URL` is the name the running stack already uses and
   * keeps working; `PUBLIC_API_URL` is the last resort, and lands on the API's
   * own origin — which does serve the page, since client.virgo.ph routes to
   * this service, but produces a link that says api.virgo.ph to a client who
   * has no business seeing it.
   *
   * Deliberately NOT WEB_APP_URL. A share link goes to somebody with no Virgo
   * account, and web.virgo.ph would put them at a sign-in wall.
   */
  private shareBaseUrl(): string {
    return (
      this.config.get<string>('CLIENT_DELIVERY_URL') ??
      this.config.get<string>('PUBLIC_APP_URL') ??
      this.config.get<string>('PUBLIC_API_URL') ??
      'https://client.virgo.ph'
    ).replace(/\/+$/, '');
  }

  urlFor(token: string): string {
    return `${this.shareBaseUrl()}/s/${token}`;
  }

  /**
   * Content-Security-Policy for the public gallery page.
   *
   * Helmet's global default is `img-src 'self' data:` with no `media-src`, so
   * every photo, video and audio file — served from another origin — was
   * blocked. The page rendered but the media was blank; opening a file
   * directly still worked, because a top-level navigation is not an embed and
   * is not subject to these directives.
   *
   * Scoped to this one route rather than loosening the global policy, and
   * still strict: no scripts at all, and only the origins media actually
   * resolves to are added.
   *
   * There are two of those now. Originals and posters are presigned URLs at
   * the B2 endpoint; proxy renditions come from the media host, which is a
   * different origin entirely. Listing only the first is how every film on
   * the page renders a poster and then refuses to play.
   */
  contentSecurityPolicy(nonce?: string): string {
    const media = [
      ...this.storage.mediaOrigins(),
      this.mediaLink.origin(),
    ].filter(Boolean);
    const sources = ["'self'", 'data:', ...media].filter(Boolean).join(' ');
    return [
      "default-src 'self'",
      `img-src ${sources}`,
      `media-src ${["'self'", ...media].filter(Boolean).join(' ')}`,
      // The page is pure HTML with one inline <style> block and no JavaScript.
      "style-src 'self' 'unsafe-inline'",
      nonce ? `script-src 'nonce-${nonce}'` : "script-src 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'none'",
      "frame-ancestors 'none'",
    ].join('; ');
  }

  private async assertOwnsAlbum(userId: string, albumId: string): Promise<void> {
    const row = await this.db.queryOne<{ id: string }>(
      'select id from albums where id = $1 and user_id = $2',
      [albumId, userId],
    );
    if (!row) throw new NotFoundException('Album not found');
  }

  /**
   * Returns the album's active link, creating one if there is none.
   *
   * Idempotent on purpose: tapping "generate link" twice should hand back the
   * same URL rather than quietly invalidating the one already sent to a client.
   *
   * `purpose` separates the link a client was sent from the one a public
   * profile links to. They must not be the same row: publishing a profile would
   * otherwise put a paying client's private delivery URL on an indexable page,
   * and revoking either would break the other.
   */
  async createOrGet(
    userId: string,
    albumId: string,
    kinds: MediaKind[] = ALL_MEDIA_KINDS,
    purpose: SharePurpose = 'client',
  ): Promise<{
    token: string;
    url: string;
    createdAt: Date;
    kinds: MediaKind[];
  }> {
    await this.assertOwnsAlbum(userId, albumId);

    // Stored in a fixed order so two equivalent selections compare equal.
    const wanted = ALL_MEDIA_KINDS.filter((k) => kinds.includes(k));
    if (wanted.length === 0) {
      throw new BadRequestException('Select at least one kind of media');
    }

    const existing = await this.db.queryOne<ShareLinkRow>(
      `select * from album_share_links
        where album_id = $1 and purpose = $2 and revoked_at is null
        limit 1`,
      [albumId, purpose],
    );

    if (existing) {
      const same =
        existing.media_kinds.length === wanted.length &&
        wanted.every((k) => existing.media_kinds.includes(k));

      // Re-scoping keeps the same token rather than issuing a new one: a link
      // already sent to a client stays valid and simply shows more or less.
      if (!same) {
        await this.db.query(
          'update album_share_links set media_kinds = $2 where id = $1',
          [existing.id, wanted],
        );
      }

      return {
        token: existing.token,
        url: this.urlFor(existing.token),
        createdAt: existing.created_at,
        kinds: wanted,
      };
    }

    const token = this.newToken();
    const row = await this.db.queryOne<ShareLinkRow>(
      `insert into album_share_links (album_id, user_id, token, media_kinds, purpose)
       values ($1, $2, $3, $4, $5)
       returning *`,
      [albumId, userId, token, wanted, purpose],
    );

    return {
      token,
      url: this.urlFor(token),
      createdAt: row?.created_at ?? new Date(),
      kinds: wanted,
    };
  }

  /** The active link for an album, if one exists. */
  async find(
    userId: string,
    albumId: string,
    purpose: SharePurpose = 'client',
  ): Promise<{
    token: string;
    url: string;
    createdAt: Date;
    kinds: MediaKind[];
  } | null> {
    await this.assertOwnsAlbum(userId, albumId);
    const row = await this.db.queryOne<ShareLinkRow>(
      `select * from album_share_links
        where album_id = $1 and purpose = $2 and revoked_at is null
        limit 1`,
      [albumId, purpose],
    );
    return row
      ? {
          token: row.token,
          url: this.urlFor(row.token),
          createdAt: row.created_at,
          kinds: row.media_kinds,
        }
      : null;
  }

  /**
   * Revokes the active link. The token is kept so it can never be reissued.
   *
   * Scoped to one purpose, so "stop sharing with the client" does not also
   * silently empty the album out of a public portfolio.
   */
  async revoke(
    userId: string,
    albumId: string,
    purpose: SharePurpose = 'client',
  ): Promise<{ revoked: boolean }> {
    await this.assertOwnsAlbum(userId, albumId);
    const rows = await this.db.query<{ id: string }>(
      `update album_share_links
          set revoked_at = now()
        where album_id = $1 and user_id = $2 and purpose = $3
          and revoked_at is null
        returning id`,
      [albumId, userId, purpose],
    );
    return { revoked: rows.length > 0 };
  }

  /**
   * Resolves a token to the album's media. No authentication.
   *
   * Returns only what a client needs to view the work: the album's name,
   * description and file URLs. Deliberately no owner identity, no album id,
   * no other album, and no write path.
   */
  /**
   * A live link, or the one refusal.
   *
   * Shared by the page and the zip so a revoked token cannot still be
   * downloadable through the other route — two copies of this query is two
   * chances for the expiry rule to drift.
   */
  private async linkFor(token: string): Promise<{
    album_id: string;
    user_id: string;
    name: string;
    description: string | null;
    media_kinds: MediaKind[];
  }> {
    const link = await this.db.queryOne<{
      album_id: string;
      user_id: string;
      name: string;
      description: string | null;
      media_kinds: MediaKind[];
    }>(
      `select l.album_id, l.user_id, l.media_kinds, a.name, a.description
         from album_share_links l
         join albums a on a.id = l.album_id
        where l.token = $1
          and l.revoked_at is null
          and (l.expires_at is null or l.expires_at > now())`,
      [token],
    );

    // Same error whether the token never existed, was revoked or expired —
    // distinguishing them would confirm which tokens are real.
    if (!link) throw new ForbiddenException('This link is no longer available');
    return link;
  }

  async resolve(
    token: string,
    filter: { kind?: MediaKind; cursor?: string; limit?: number } = {},
  ): Promise<PublicAlbumView> {
    const link = await this.linkFor(token);

    if (filter.kind && !link.media_kinds.includes(filter.kind)) {
      throw new ForbiddenException('This media is not included in the link');
    }

    const params: unknown[] = [link.user_id, link.album_id, link.media_kinds];
    let where = `user_id = $1
          and album_id = $2
          and split_part(coalesce(content_type, ''), '/', 1) = any($3::text[])`;
    if (filter.kind) {
      params.push(filter.kind);
      where += ` and split_part(coalesce(content_type, ''), '/', 1) = $${params.length}`;
    }
    if (filter.cursor) {
      const cursor = decodeFileCursor(filter.cursor);
      params.push(cursor.createdAt, cursor.key);
      where += ` and (created_at, key) < ($${params.length - 1}::timestamptz, $${params.length}::text)`;
    }
    const limit = Math.min(Math.max(filter.limit ?? 60, 1), 100);
    params.push(limit + 1);

    // Filtered in SQL, not after fetching: a photos-only link must not put
    // video URLs on the wire at all, or the scope would be cosmetic.
    const files = await this.db.query<{
      key: string;
      thumb_key: string | null;
      poster_key: string | null;
      proxy_key: string | null;
      content_type: string | null;
      size_bytes: string;
      created_at: Date;
      original_name: string | null;
      width_px: number | null;
      height_px: number | null;
      duration_ms: string | null;
      media_title: string | null;
      media_artist: string | null;
      processing_status: 'pending' | 'ready' | 'failed' | 'not_required';
    }>(
      `select key, thumb_key, poster_key, proxy_key, content_type, size_bytes, created_at,
              original_name, width_px, height_px, duration_ms,
              media_title, media_artist, processing_status
         from user_files
        where ${where}
        order by created_at desc, key desc
        limit $${params.length}`,
      params,
    );

    const hasMore = files.length > limit;
    const pageFiles = hasMore ? files.slice(0, limit) : files;
    const summary = await this.db.queryOne<{
      total: string;
      total_bytes: string;
      image_count: string;
      video_count: string;
      audio_count: string;
    }>(
      `select count(*)::text as total,
              coalesce(sum(size_bytes), 0)::text as total_bytes,
              count(*) filter (where content_type like 'image/%')::text as image_count,
              count(*) filter (where content_type like 'video/%')::text as video_count,
              count(*) filter (where content_type like 'audio/%')::text as audio_count
         from user_files
        where user_id = $1 and album_id = $2
          and split_part(coalesce(content_type, ''), '/', 1) = any($3::text[])`,
      [link.user_id, link.album_id, link.media_kinds],
    );

    // The share token is the authorisation, so the URLs handed back are
    // signed on the strength of it. The longer TTL is because a client opens a
    // gallery and then looks at it for a while, sometimes leaving the tab up.
    //
    // Three signatures per file rather than one. Display and download differ
    // because the download carries a signed Content-Disposition — the only
    // way to make a cross-origin link actually save instead of opening — and
    // that is part of what is signed, so it cannot be bolted on afterwards.
    const names = pageFiles.map((f, i) => deliveryName(link.name, i, f.key));
    const [urls, thumbUrls, posterUrls, downloadUrls] = await Promise.all([
      this.storage.mediaUrls(
        pageFiles.map((f) => f.key),
        PUBLISHED_URL_TTL_SECONDS,
      ),
      this.storage.mediaUrls(
        pageFiles.map((f) => f.thumb_key),
        PUBLISHED_URL_TTL_SECONDS,
      ),
      this.storage.mediaUrls(
        pageFiles.map((f) => f.poster_key),
        PUBLISHED_URL_TTL_SECONDS,
      ),
      this.storage.mediaUrls(
        pageFiles.map((f) => f.key),
        PUBLISHED_URL_TTL_SECONDS,
        names,
      ),
    ]);

    return {
      album: { name: link.name, description: link.description },
      kinds: link.media_kinds,
      totalBytes: Number(summary?.total_bytes ?? 0),
      total: Number(summary?.total ?? 0),
      counts: {
        image: Number(summary?.image_count ?? 0),
        video: Number(summary?.video_count ?? 0),
        audio: Number(summary?.audio_count ?? 0),
      },
      nextCursor:
        hasMore && pageFiles.at(-1)
          ? encodeFileCursor(pageFiles.at(-1)!.created_at, pageFiles.at(-1)!.key)
          : null,
      files: pageFiles.map((f, i) => ({
        url: urls[i],
        thumbUrl: thumbUrls[i],
        posterUrl: posterUrls[i],
        proxyUrl: this.mediaLink.url(f.proxy_key, PUBLISHED_URL_TTL_SECONDS),
        downloadUrl: downloadUrls[i],
        downloadName: names[i],
        contentType: f.content_type,
        sizeBytes: Number(f.size_bytes),
        originalName: f.original_name ?? f.key.split('/').pop() ?? f.key,
        width: f.width_px,
        height: f.height_px,
        durationMs: f.duration_ms ? Number(f.duration_ms) : null,
        mediaTitle: f.media_title,
        mediaArtist: f.media_artist,
        processingStatus: f.processing_status,
      })),
    };
  }

  /** Raw bytes of one object, for the zip to append. */
  streamFor(key: string) {
    return this.storage.readStream(key);
  }

  /**
   * The same files a share page shows, as keys — for the zip.
   *
   * Separate from `resolve` because the zip needs object keys to stream and
   * has no use for three signed URLs per file; signing a few hundred of those
   * to then throw them away is wasted work on the request that is already the
   * expensive one.
   */
  async filesForDownload(token: string): Promise<{
    albumName: string;
    files: { key: string; name: string }[];
  }> {
    const link = await this.linkFor(token);
    const files = await this.db.query<{ key: string }>(
      `select key
         from user_files
        where user_id = $1
          and album_id = $2
          and split_part(coalesce(content_type, ''), '/', 1) = any($3::text[])
        order by created_at desc, key desc`,
      [link.user_id, link.album_id, link.media_kinds],
    );

    return {
      albumName: link.name,
      files: files.map((f, i) => ({
        key: f.key,
        name: deliveryName(link.name, i, f.key),
      })),
    };
  }
}
