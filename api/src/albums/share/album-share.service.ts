import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { DatabaseService } from '../../database/database.service';
import {
  DOWNLOAD_URL_TTL_SECONDS,
  PUBLISHED_URL_TTL_SECONDS,
} from '../../storage/storage.config';
import { HlsService } from '../../storage/hls.service';
import { MediaLinkService } from '../../storage/media-link.service';
import { StorageService } from '../../storage/storage.service';
import type { ZipFile } from '../../storage/zip-cache.service';
import { NotifyService } from '../../notifications/notify.service';
import {
  accessAllows,
  decodeFileCursor,
  encodeFileCursor,
  QuotaService,
  SORT_AT_TEXT_SQL,
  TAKEN_AT_TEXT_SQL,
} from '../../quota/quota.service';
import { SORT_AT_SQL } from '../../storage/capture-time';
import { WorkspaceActivityService } from '../../workspaces/workspace-activity.service';
import { IN_LIVE_WORKSPACE } from '../../workspaces/live-workspace';

export interface ShareLinkRow {
  id: string;
  album_id: string;
  user_id: string;
  token: string;
  media_kinds: MediaKind[];
  expires_at: Date | null;
  revoked_at: Date | null;
  purpose: SharePurpose;
  scope: LinkScope;
  section_id: string | null;
  files_hash: string | null;
  created_at: Date;
  picks_sent_at: Date | null;
}

/**
 * How much of its album a link shows: all of it, one section, or a chosen set
 * of files (album_share_link_files). Part links are always client links.
 */
export type LinkScope = 'album' | 'section' | 'files';

/** A client link to part of an album, as the album's managers see it. */
export interface PartLink {
  id: string;
  scope: 'section' | 'files';
  url: string;
  createdAt: Date;
  sectionId: string | null;
  sectionName: string | null;
  /** What it shows now: files deleted or moved out of the album since drop out. */
  fileCount: number;
  picksSentAt: Date | null;
}

/** The most files one selection link may name. A bigger set is the album link's job. */
export const MAX_LINK_FILES = 2000;

/** A live link as the public routes read it: the link, its album, and its part. */
interface LinkRef {
  id: string;
  album_id: string;
  user_id: string;
  name: string;
  description: string | null;
  media_kinds: MediaKind[];
  purpose: SharePurpose;
  picks_sent_at: Date | null;
  scope: LinkScope;
  section_id: string | null;
  section_name: string | null;
}

/** Postgres refusing a row a unique index already holds. */
function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === '23505';
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
  /**
   * What part of the album the link shows, for the page to say so: one
   * section by name, or a selection. Null on a whole-album link.
   */
  part: { kind: 'section'; name: string } | { kind: 'files' } | null;
  files: {
    /**
     * An opaque id for the file, for picking it. Deliberately not the object
     * key: a key begins `users/<owner id>/`, and this page promises no owner
     * identity. The row's own random id says nothing about anyone.
     */
    id: string;
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
    /**
     * Intermediate copies for viewing, narrowest first.
     *
     * Opening a photograph used to serve the original — a 6 MB camera JPEG,
     * or a 40 MB TIFF, to fill a viewport about 1400 px wide. Empty means
     * there are none and the page falls back to `url`.
     */
    displaySources: { width: number; url: string }[];
    /**
     * The adaptive ladder, or null when there is not one.
     *
     * Null until the album is shared — building one is what sharing pays for
     * — and for films too small to be worth rungs. The page falls through to
     * `proxyUrl` and then to `url`.
     */
    hlsUrl: string | null;
    /**
     * A ~300 byte inline preview, or null when there is not one.
     *
     * Rides in this response rather than being fetched, so the gallery paints
     * completely before a single thumbnail is requested.
     */
    blurDataUrl: string | null;
    /** Same object, signed to save rather than open. */
    downloadUrl: string | null;
    /** What it saves as: "Album Name - 004.jpg". */
    downloadName: string;
    /** The camera's wall clock, `2026-03-14T16:42:05`, or null when unknown. */
    takenAt: string | null;
    /** When it was uploaded, for grouping a file with no `takenAt`. */
    createdAt: string;
    contentType: string | null;
    sizeBytes: number;
    originalName: string;
    width: number | null;
    height: number | null;
    durationMs: number | null;
    mediaTitle: string | null;
    mediaArtist: string | null;
    processingStatus: 'pending' | 'ready' | 'failed' | 'not_required';
    /** The album section it is filed under, or null. */
    sectionId: string | null;
    /** Whether the client has picked it. Always false on a portfolio link. */
    picked: boolean;
  }[];
  /** Sections the link is scoped to, so the page renders only those. */
  kinds: MediaKind[];
  /**
   * The album's sections that hold something this link shows, in the
   * photographer's order — the page's chapters. Empty when the album has
   * none, and the page then shows no chapter row at all.
   */
  sections: { id: string; name: string; count: number }[];
  /**
   * Picking is for the client a delivery was made for. A portfolio link is
   * public, so on one `enabled` is false and nothing can be marked.
   */
  picks: { enabled: boolean; count: number; sentAt: string | null };
  /**
   * Whether this link hands over files at all. True only for a client
   * delivery. A portfolio link is reached from a public profile, so it shows
   * renditions and offers no download, no zip and no original filename.
   */
  downloads: boolean;
  /**
   * Every byte the link covers, for the "Download all" button to declare.
   * 0 on a portfolio link, which has no such button.
   */
  totalBytes: number;
  total: number;
  nextCursor: string | null;
  counts: Record<MediaKind, number>;
}

// Moved beside the zip streamer, which every download now shares; re-exported
// so the name keeps resolving where it always has.
export { safeFileStem } from '../../storage/download-names';
import { safeFileStem } from '../../storage/download-names';

/**
 * Sequential names for delivered files: "Reyes Wedding - 007.jpg".
 *
 * Sequential numbering is what a delivery gallery wants: a client who
 * downloads 200 photos gets them in the order they were shown, rather than a
 * pile of IMG_4821.JPG, and the album name is on every file once it leaves the
 * zip.
 *
 * `index` is the file's place in the whole link, oldest first — never its
 * place on a page. Numbering per page named the first photograph of every
 * page "- 001", so two downloads from one gallery overwrote each other and
 * neither matched the name the same file had inside the zip.
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
    private readonly hls: HlsService,
    private readonly config: ConfigService,
    private readonly notify: NotifyService,
    private readonly feed: WorkspaceActivityService,
    private readonly quota: QuotaService,
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

  /**
   * The album's owner, once the caller may handle this kind of link for it.
   *
   * A client link is for anyone who can manage the album: its owner, or a
   * workspace member granted 'manage' on it. Those members already arrange and
   * deliver the album, and the link is how it is delivered; owner-only left
   * them with a finished album and no way to send it. A portfolio link stays
   * the owner's alone, because it puts the album on the owner's public profile.
   *
   * The link always belongs to the owner, whoever made it: the gallery reads
   * the album's files as the owner's rows (a member's uploads are filed under
   * the owner too) and downloads spend the owner's allowance.
   */
  private async linkOwner(
    userId: string,
    albumId: string,
    purpose: SharePurpose,
  ): Promise<string> {
    const access = await this.quota.accessForAlbum(userId, albumId);
    const allowed = purpose === 'client' ? accessAllows(access, 'manage') : access === 'owner';
    if (!allowed) {
      // No access at all reads as no album, so an id cannot be probed. A
      // member who can see the album is told why instead.
      if (!access) throw new NotFoundException('Album not found');
      throw new ForbiddenException(
        purpose === 'client'
          ? 'Only someone who can manage this album can share it with a client'
          : "Only the album's owner can show it on their profile",
      );
    }
    const owner = await this.quota.albumOwner(albumId);
    if (!owner) throw new NotFoundException('Album not found');
    return owner;
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
    picksSentAt: Date | null;
  }> {
    const ownerId = await this.linkOwner(userId, albumId, purpose);

    // Stored in a fixed order so two equivalent selections compare equal.
    const wanted = ALL_MEDIA_KINDS.filter((k) => kinds.includes(k));
    if (wanted.length === 0) {
      throw new BadRequestException('Select at least one kind of media');
    }

    const existing = await this.db.queryOne<ShareLinkRow>(
      `select * from album_share_links
        where album_id = $1 and purpose = $2 and scope = 'album' and revoked_at is null
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

      // Re-scoping can bring films into a link that previously excluded them,
      // and an album can gain films after it was first shared. Queueing here
      // as well as on creation is what catches both; `enqueueAlbum` only
      // touches films that have no ladder and have not failed, so calling it
      // again is free.
      void this.hls.enqueueAlbum(albumId);

      return {
        token: existing.token,
        url: this.urlFor(existing.token),
        createdAt: existing.created_at,
        kinds: wanted,
        picksSentAt: existing.picks_sent_at,
      };
    }

    const token = this.newToken();
    const row = await this.db.queryOne<ShareLinkRow>(
      `insert into album_share_links (album_id, user_id, token, media_kinds, purpose)
       values ($1, $2, $3, $4, $5)
       returning *`,
      [albumId, ownerId, token, wanted, purpose],
    );

    // Sharing an album is what pays for its ladders. Deliberately not awaited:
    // building them takes minutes and this call is a button press. The work is
    // a database flag and a cron, so nothing is lost if this request ends
    // first — and a queue failure must not cost the user their share link.
    void this.hls.enqueueAlbum(albumId);

    return {
      token,
      url: this.urlFor(token),
      createdAt: row?.created_at ?? new Date(),
      kinds: wanted,
      picksSentAt: null,
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
    picksSentAt: Date | null;
  } | null> {
    await this.linkOwner(userId, albumId, purpose);
    const row = await this.db.queryOne<ShareLinkRow>(
      `select * from album_share_links
        where album_id = $1 and purpose = $2 and scope = 'album' and revoked_at is null
        limit 1`,
      [albumId, purpose],
    );
    return row
      ? {
          token: row.token,
          url: this.urlFor(row.token),
          createdAt: row.created_at,
          kinds: row.media_kinds,
          picksSentAt: row.picks_sent_at,
        }
      : null;
  }

  /**
   * Revokes the active link. The token is kept so it can never be reissued.
   *
   * Scoped to one purpose, so "stop sharing with the client" does not also
   * silently empty the album out of a public portfolio. The whole-album link
   * only: links to a section or a selection are turned off one by one
   * (revokePart), since each may have gone to someone else.
   */
  async revoke(
    userId: string,
    albumId: string,
    purpose: SharePurpose = 'client',
  ): Promise<{ revoked: boolean }> {
    await this.linkOwner(userId, albumId, purpose);
    // By album, not by who is asking: a manager turns off the owner's link,
    // and there is only ever one live link per album and purpose.
    const rows = await this.db.query<{ id: string }>(
      `update album_share_links
          set revoked_at = now()
        where album_id = $1 and purpose = $2 and scope = 'album'
          and revoked_at is null
        returning id`,
      [albumId, purpose],
    );
    return { revoked: rows.length > 0 };
  }

  /** The album's live links to a section or a selection, newest first. */
  async listParts(userId: string, albumId: string): Promise<PartLink[]> {
    await this.linkOwner(userId, albumId, 'client');
    return this.partsWhere('l.album_id = $1', [albumId]);
  }

  /**
   * A link to one section of the album. Like the album's own link, asking
   * again hands back the same one: a link already sent keeps working.
   */
  async createSectionLink(userId: string, albumId: string, sectionId: string): Promise<PartLink> {
    const ownerId = await this.linkOwner(userId, albumId, 'client');
    const section = await this.db.queryOne<{ id: string }>(
      'select id from album_sections where id = $1 and album_id = $2',
      [sectionId, albumId],
    );
    if (!section) throw new NotFoundException('That section is not in this album');

    const live = () =>
      this.partsWhere(`l.scope = 'section' and l.section_id = $1`, [sectionId]).then((r) => r[0]);
    const existing = await live();
    if (existing) return existing;
    try {
      await this.db.query(
        `insert into album_share_links (album_id, user_id, token, media_kinds, purpose, scope, section_id)
         values ($1, $2, $3, $4, 'client', 'section', $5)`,
        [albumId, ownerId, this.newToken(), ALL_MEDIA_KINDS, sectionId],
      );
    } catch (err) {
      // Two taps at once: the other one made it, and that is the link.
      if (!isUniqueViolation(err)) throw err;
    }
    void this.hls.enqueueAlbum(albumId);
    return (await live())!;
  }

  /**
   * A link to a chosen set of the album's files — one file is a set of one.
   * The same set asked for twice is the same link; a different set is a new
   * one, since each selection may go to someone else.
   */
  async createFilesLink(userId: string, albumId: string, keys: readonly string[]): Promise<PartLink> {
    const ownerId = await this.linkOwner(userId, albumId, 'client');
    const wanted = [...new Set(keys)].sort();
    if (wanted.length === 0) throw new BadRequestException('Select at least one file');
    if (wanted.length > MAX_LINK_FILES) {
      throw new BadRequestException(`A link can name up to ${MAX_LINK_FILES} files; share the album instead`);
    }
    // The owner's rows, as the gallery reads them (a member's uploads are filed
    // under the owner). Anything else would be in the link and never shown.
    const found = await this.db.queryOne<{ count: string }>(
      `select count(*)::text as count from user_files
        where user_id = $1 and album_id = $2 and key = any($3::text[])`,
      [ownerId, albumId, wanted],
    );
    if (Number(found?.count ?? 0) !== wanted.length) {
      throw new BadRequestException('Some of those files are not in this album');
    }

    const hash = createHash('sha256').update(wanted.join('\0')).digest('hex');
    const live = () =>
      this.partsWhere(`l.album_id = $1 and l.scope = 'files' and l.files_hash = $2`, [
        albumId,
        hash,
      ]).then((r) => r[0]);
    const existing = await live();
    if (existing) return existing;
    try {
      // One statement, so a link never exists without its files.
      await this.db.query(
        `with link as (
           insert into album_share_links (album_id, user_id, token, media_kinds, purpose, scope, files_hash)
           values ($1, $2, $3, $4, 'client', 'files', $5)
           returning id
         )
         insert into album_share_link_files (link_id, file_key)
         select link.id, k from link, unnest($6::text[]) as k`,
        [albumId, ownerId, this.newToken(), ALL_MEDIA_KINDS, hash, wanted],
      );
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
    void this.hls.enqueueAlbum(albumId);
    return (await live())!;
  }

  /** Turns off one link to a section or a selection of this album. */
  async revokePart(userId: string, albumId: string, linkId: string): Promise<{ revoked: boolean }> {
    await this.linkOwner(userId, albumId, 'client');
    const rows = await this.db.query<{ id: string }>(
      `update album_share_links
          set revoked_at = now()
        where id::text = $1 and album_id = $2 and scope <> 'album' and revoked_at is null
        returning id`,
      [linkId, albumId],
    );
    return { revoked: rows.length > 0 };
  }

  /** Live part links matching `where` (on `l`), with what each shows now. */
  private async partsWhere(where: string, params: unknown[]): Promise<PartLink[]> {
    const rows = await this.db.query<{
      id: string;
      token: string;
      scope: 'section' | 'files';
      created_at: Date;
      section_id: string | null;
      section_name: string | null;
      file_count: string;
      picks_sent_at: Date | null;
    }>(
      `select l.id, l.token, l.scope, l.created_at, l.section_id, s.name as section_name,
              l.picks_sent_at,
              case l.scope
                when 'section' then (
                  select count(*) from user_files f
                   where f.user_id = l.user_id and f.album_id = l.album_id
                     and f.section_id = l.section_id)
                else (
                  select count(*) from album_share_link_files lf
                    join user_files f on f.key = lf.file_key
                   where lf.link_id = l.id and f.user_id = l.user_id and f.album_id = l.album_id)
              end::text as file_count
         from album_share_links l
         left join album_sections s on s.id = l.section_id
        where ${where} and l.scope <> 'album' and l.revoked_at is null
        order by l.created_at desc`,
      params,
    );
    return rows.map((r) => ({
      id: r.id,
      scope: r.scope,
      url: this.urlFor(r.token),
      createdAt: r.created_at,
      sectionId: r.section_id,
      sectionName: r.section_name,
      fileCount: Number(r.file_count),
      picksSentAt: r.picks_sent_at,
    }));
  }

  /**
   * The condition that keeps a query to the part of the album a link shows,
   * for user_files (or a select from it) aliased `f`. Appends what it needs to
   * `params`. Nothing for a whole-album link.
   *
   * Every query that reads files through a link takes it — the page, picks,
   * single downloads and the zip — so a part link cannot be widened through
   * any of them. Positions are still counted across the album before it
   * applies, so a file has one name in every link: frame 57 is "- 057" in
   * the album's link and in a link to its section.
   */
  private partSql(link: LinkRef, f: string, params: unknown[]): string {
    if (link.scope === 'section') {
      params.push(link.section_id);
      return ` and ${f}.section_id = $${params.length}`;
    }
    if (link.scope === 'files') {
      params.push(link.id);
      return ` and exists (select 1 from album_share_link_files lf
                            where lf.link_id = $${params.length} and lf.file_key = ${f}.key)`;
    }
    return '';
  }

  /** What the page and the zip call what a link shows. */
  private titleOf(link: LinkRef): string {
    if (link.scope === 'section' && link.section_name) return `${link.name} - ${link.section_name}`;
    if (link.scope === 'files') return `${link.name} - selection`;
    return link.name;
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
  private async linkFor(token: string): Promise<LinkRef> {
    const link = await this.db.queryOne<LinkRef>(
      `select l.id, l.album_id, l.user_id, l.media_kinds, l.purpose, l.picks_sent_at,
              l.scope, l.section_id, s.name as section_name,
              a.name, a.description
         from album_share_links l
         join albums a on a.id = l.album_id
         left join album_sections s on s.id = l.section_id
        where l.token = $1
          and l.revoked_at is null
          and (l.expires_at is null or l.expires_at > now())
          -- Off while its workspace is in Recently deleted, back on restore.
          and ${IN_LIVE_WORKSPACE('a')}`,
      [token],
    );

    // Same error whether the token never existed, was revoked or expired —
    // distinguishing them would confirm which tokens are real.
    if (!link) throw new ForbiddenException('This link is no longer available');
    return link;
  }

  async resolve(
    token: string,
    filter: {
      kind?: MediaKind;
      cursor?: string;
      limit?: number;
      /** A section id: one chapter. */
      section?: string;
      /** Only what the client has picked. */
      picked?: boolean;
    } = {},
  ): Promise<PublicAlbumView> {
    const link = await this.linkFor(token);

    if (filter.kind && !link.media_kinds.includes(filter.kind)) {
      throw new ForbiddenException('This media is not included in the link');
    }

    // Opening a gallery is the other thing that pays for a ladder, and it is
    // what closes the loop the sweep opens: an evicted ladder comes back the
    // next time somebody actually watches, rather than degrading to the proxy
    // for good. Only on the first page of a link that includes film, so this
    // is once per gallery open rather than once per scroll, and the
    // `hls_status = 'none'` filter inside makes every later call a no-op.
    if (!filter.cursor && link.media_kinds.includes('video')) {
      void this.hls.enqueueAlbum(link.album_id);
    }

    // Oldest first: a delivered album is read as the day went, prep before
    // ceremony before reception. It used to open on whatever was uploaded
    // last, which put the album in the order it came off the photographer's
    // laptop rather than the order it happened in.
    const params: unknown[] = [link.user_id, link.album_id, link.media_kinds];
    // Outside the numbering below, so a part link keeps the album's numbers.
    let where = `true${this.partSql(link, 'scoped', params)}`;
    if (filter.kind) {
      params.push(filter.kind);
      where += ` and split_part(coalesce(content_type, ''), '/', 1) = $${params.length}`;
    }
    if (filter.section) {
      params.push(filter.section);
      where += ` and section_id = $${params.length}`;
    }
    if (filter.picked) where += ' and picked';
    if (filter.cursor) {
      const cursor = decodeFileCursor(filter.cursor, 'oldest');
      params.push(cursor.sortAt, cursor.key);
      where += ` and (sort_ts, key) > ($${params.length - 1}::timestamp, $${params.length}::text)`;
    }
    const limit = Math.min(Math.max(filter.limit ?? 60, 1), 100);
    params.push(limit + 1);

    // Filtered in SQL, not after fetching: a photos-only link must not put
    // video URLs on the wire at all, or the scope would be cosmetic.
    const files = await this.db.query<{
      id: string;
      key: string;
      thumb_key: string | null;
      poster_key: string | null;
      proxy_key: string | null;
      display_widths: number[] | null;
      hls_prefix: string | null;
      blur_data_url: string | null;
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
      taken_at: string | null;
      sort_at: string;
      position: string;
      section_id: string | null;
      picked: boolean;
    }>(
      // Numbered across everything the link shows before any filter or page
      // is applied, so a file's delivery name is the same on every tab, every
      // page and inside the zip.
      `with scoped as (
         select id, key, thumb_key, poster_key, proxy_key, display_widths, hls_prefix,
                blur_data_url, content_type, size_bytes, created_at,
                original_name, width_px, height_px, duration_ms,
                media_title, media_artist, processing_status,
                ${TAKEN_AT_TEXT_SQL} as taken_at,
                ${SORT_AT_TEXT_SQL} as sort_at,
                ${SORT_AT_SQL} as sort_ts,
                row_number() over (order by ${SORT_AT_SQL}, key) as position,
                section_id,
                exists (
                  select 1 from album_picks p
                   where p.album_id = user_files.album_id and p.file_key = user_files.key
                ) as picked
           from user_files
          where user_id = $1
            and album_id = $2
            and split_part(coalesce(content_type, ''), '/', 1) = any($3::text[])
       )
       select * from scoped
        where ${where}
        order by sort_ts, key
        limit $${params.length}`,
      params,
    );

    const hasMore = files.length > limit;
    const pageFiles = hasMore ? files.slice(0, limit) : files;

    // A portfolio link is the one a public profile's album card opens, so it
    // shows only what a rendition can stand in for, and never signs an
    // original: the camera file carries its EXIF, GPS included. A photograph
    // with neither a thumbnail nor a display copy is left out rather than
    // sent whole. The cursor still comes from the page as fetched, so paging
    // is unchanged, and each file keeps its own place in the numbering.
    const portfolio = link.purpose === 'portfolio';
    const shown = portfolio
      ? pageFiles.filter((f) => f.thumb_key || f.display_widths?.length)
      : pageFiles;

    // The kind counts follow the chapter and the picks filter, so each tab
    // counts what is on screen. The totals are the whole link: they are what
    // "Download all" is about to hand over.
    const scope: unknown[] = [link.user_id, link.album_id, link.media_kinds];
    const part = this.partSql(link, 'f', scope);
    let inScope = '';
    if (filter.section) {
      scope.push(filter.section);
      inScope += ` and f.section_id = $${scope.length}`;
    }
    if (filter.picked) inScope += ' and p.file_key is not null';
    const summary = await this.db.queryOne<{
      total: string;
      total_bytes: string;
      image_count: string;
      video_count: string;
      audio_count: string;
      picked_count: string;
    }>(
      `select count(*)::text as total,
              coalesce(sum(f.size_bytes), 0)::text as total_bytes,
              count(*) filter (where f.content_type like 'image/%'${inScope})::text as image_count,
              count(*) filter (where f.content_type like 'video/%'${inScope})::text as video_count,
              count(*) filter (where f.content_type like 'audio/%'${inScope})::text as audio_count,
              count(p.file_key)::text as picked_count
         from user_files f
         left join album_picks p on p.album_id = f.album_id and p.file_key = f.key
        where f.user_id = $1 and f.album_id = $2
          and split_part(coalesce(f.content_type, ''), '/', 1) = any($3::text[])${part}`,
      scope,
    );

    // Only chapters with something in them for THIS link: a photos-only link
    // must not offer a "Speeches" chapter that opens on nothing, and a link to
    // a selection offers only the chapters its files are in.
    const chapterScope: unknown[] = [link.user_id, link.album_id, link.media_kinds];
    const sections = await this.db.query<{ id: string; name: string; count: string }>(
      `select s.id, s.name, count(*)::text as count
         from album_sections s
         join user_files f on f.section_id = s.id and f.album_id = s.album_id
        where s.album_id = $2 and f.user_id = $1
          and split_part(coalesce(f.content_type, ''), '/', 1) = any($3::text[])${this.partSql(link, 'f', chapterScope)}
        group by s.id
        order by s.position, s.created_at`,
      chapterScope,
    );

    // The share token is the authorisation, so the URLs handed back are
    // signed on the strength of it. The longer TTL is because a client opens a
    // gallery and then looks at it for a while, sometimes leaving the tab up.
    //
    // Three signatures per file rather than one. Display and download differ
    // because the download carries a signed Content-Disposition — the only
    // way to make a cross-origin link actually save instead of opening — and
    // that is part of what is signed, so it cannot be bolted on afterwards.
    const names = shown.map((f) =>
      deliveryName(link.name, Number(f.position) - 1, f.key),
    );
    const [urls, thumbUrls, posterUrls, downloadUrls] = await Promise.all([
      this.storage.mediaUrls(
        shown.map((f) => (portfolio ? null : f.key)),
        PUBLISHED_URL_TTL_SECONDS,
      ),
      this.storage.mediaUrls(
        shown.map((f) => f.thumb_key),
        PUBLISHED_URL_TTL_SECONDS,
      ),
      this.storage.mediaUrls(
        shown.map((f) => f.poster_key),
        PUBLISHED_URL_TTL_SECONDS,
      ),
      portfolio
        ? Promise.resolve(shown.map(() => null))
        : this.storage.mediaUrls(
            shown.map((f) => f.key),
            PUBLISHED_URL_TTL_SECONDS,
            names,
          ),
    ]);

    return {
      album: { name: link.name, description: link.description },
      part:
        link.scope === 'section'
          ? { kind: 'section', name: link.section_name ?? '' }
          : link.scope === 'files'
            ? { kind: 'files' }
            : null,
      kinds: link.media_kinds,
      sections: sections.map((s) => ({ id: s.id, name: s.name, count: Number(s.count) })),
      picks: {
        enabled: link.purpose === 'client',
        count: Number(summary?.picked_count ?? 0),
        sentAt: link.picks_sent_at ? link.picks_sent_at.toISOString() : null,
      },
      downloads: link.purpose === 'client',
      totalBytes: portfolio ? 0 : Number(summary?.total_bytes ?? 0),
      total: Number(summary?.total ?? 0),
      counts: {
        image: Number(summary?.image_count ?? 0),
        video: Number(summary?.video_count ?? 0),
        audio: Number(summary?.audio_count ?? 0),
      },
      nextCursor:
        hasMore && pageFiles.at(-1)
          ? encodeFileCursor(pageFiles.at(-1)!.sort_at, pageFiles.at(-1)!.key, 'oldest')
          : null,
      files: shown.map((f, i) => {
        const displaySources = this.mediaLink.displaySources(
          f.key,
          f.display_widths,
          PUBLISHED_URL_TTL_SECONDS,
        );
        return {
          id: f.id,
          // On a portfolio link the widest rendition there is, never the file.
          url: portfolio ? (displaySources.at(-1)?.url ?? thumbUrls[i] ?? null) : urls[i],
          thumbUrl: thumbUrls[i],
          posterUrl: posterUrls[i],
          proxyUrl: this.mediaLink.url(f.proxy_key, PUBLISHED_URL_TTL_SECONDS),
          displaySources,
          hlsUrl: this.mediaLink.hlsUrl(f.hls_prefix, PUBLISHED_URL_TTL_SECONDS),
          blurDataUrl: f.blur_data_url,
          downloadUrl: downloadUrls[i],
          downloadName: names[i],
          takenAt: f.taken_at,
          createdAt: f.created_at.toISOString(),
          contentType: f.content_type,
          // The delivery name, without its extension, and no size: what the
          // file was called on the photographer's laptop, and how big the
          // original is, are nothing a stranger on a profile needs.
          sizeBytes: portfolio ? 0 : Number(f.size_bytes),
          originalName: portfolio
            ? names[i].replace(/\.[^.]+$/, '')
            : (f.original_name ?? f.key.split('/').pop() ?? f.key),
          width: f.width_px,
          height: f.height_px,
          durationMs: f.duration_ms ? Number(f.duration_ms) : null,
          mediaTitle: f.media_title,
          mediaArtist: f.media_artist,
          processingStatus: f.processing_status,
          sectionId: f.section_id,
          picked: link.purpose === 'client' && f.picked,
        };
      }),
    };
  }

  /**
   * Marks or unmarks one file as picked, through a client link.
   *
   * The token is the whole credential here, exactly as it is for viewing:
   * anyone who can open the delivery can choose from it. What it cannot do is
   * pick a file the link does not show — another album's, or a film on a
   * photos-only link — which is checked against the link rather than trusted
   * from the request.
   *
   * Returns the new state and the total, so the page's counter never has to
   * guess after a tap that raced another.
   */
  async setPick(
    token: string,
    fileId: string,
    picked: boolean,
  ): Promise<{ picked: boolean; count: number }> {
    const link = await this.linkFor(token);
    if (link.purpose !== 'client') {
      throw new ForbiddenException('Picking is only available on a client link');
    }
    const params: unknown[] = [fileId, link.user_id, link.album_id, link.media_kinds];
    const file = await this.db.queryOne<{ key: string }>(
      `select key from user_files f
        where id = $1 and user_id = $2 and album_id = $3
          and split_part(coalesce(content_type, ''), '/', 1) = any($4::text[])${this.partSql(link, 'f', params)}`,
      params,
    );
    if (!file) throw new NotFoundException('That file is not in this delivery');
    const key = file.key;

    if (picked) {
      await this.db.query(
        `insert into album_picks (album_id, file_key, link_id)
         values ($1, $2, $3)
         on conflict (album_id, file_key) do nothing`,
        [link.album_id, key, link.id],
      );
    } else {
      await this.db.query(
        'delete from album_picks where album_id = $1 and file_key = $2',
        [link.album_id, key],
      );
    }
    return { picked, count: await this.pickCount(link) };
  }

  /**
   * The client saying "these are the ones" — tells the photographer.
   *
   * Picks are saved as they are made, so this sends nothing the server does
   * not already have. What it adds is the moment: a selection someone is
   * still scrolling through and one they have finished look identical in the
   * table, and only the client knows which it is.
   */
  async sendPicks(token: string): Promise<{ count: number; sentAt: string }> {
    const link = await this.linkFor(token);
    if (link.purpose !== 'client') {
      throw new ForbiddenException('Picking is only available on a client link');
    }
    const count = await this.pickCount(link);
    if (count === 0) throw new BadRequestException('Pick at least one file first');

    const row = await this.db.queryOne<{ picks_sent_at: Date }>(
      'update album_share_links set picks_sent_at = now() where id = $1 returning picks_sent_at',
      [link.id],
    );
    // No actor: the client is on a link, not an account.
    await this.feed.recordInAlbum(link.album_id, null, 'picks', count);

    await this.notify
      .notify([link.user_id], {
        topic: 'client-picks',
        title: 'Your client sent their picks',
        body: `${count} file${count === 1 ? '' : 's'} chosen from “${this.titleOf(link)}”.`,
        data: { type: 'client_picks', albumId: link.album_id },
      })
      .catch(() => {
        // The picks are saved either way; a missed alert must not tell the
        // client their choice failed.
      });

    return { count, sentAt: row!.picks_sent_at.toISOString() };
  }

  /** The picked files, named as they are everywhere else in the delivery. */
  async picksForDownload(token: string): Promise<{
    albumName: string;
    files: ZipFile[];
    /** Whose download allowance this spends. Never sent to the client. */
    ownerId: string;
  }> {
    const link = await this.linkFor(token);
    if (link.purpose !== 'client') {
      throw new ForbiddenException('Picking is only available on a client link');
    }
    const params: unknown[] = [link.user_id, link.album_id, link.media_kinds];
    const files = await this.db.query<{ key: string; position: string; size_bytes: string | null }>(
      `with scoped as (
         select key, album_id, size_bytes, section_id,
                row_number() over (order by ${SORT_AT_SQL}, key) as position,
                ${SORT_AT_SQL} as sort_ts
           from user_files
          where user_id = $1 and album_id = $2
            and split_part(coalesce(content_type, ''), '/', 1) = any($3::text[])
       )
       select s.key, s.position, s.size_bytes::text as size_bytes
         from scoped s
         join album_picks p on p.album_id = s.album_id and p.file_key = s.key
        where true${this.partSql(link, 's', params)}
        order by s.sort_ts, s.key`,
      params,
    );
    return {
      albumName: `${this.titleOf(link)} - picks`,
      ownerId: link.user_id,
      files: files.map((f) => ({
        key: f.key,
        name: deliveryName(link.name, Number(f.position) - 1, f.key),
        size: Number(f.size_bytes ?? 0) || 0,
      })),
    };
  }

  private async pickCount(link: LinkRef): Promise<number> {
    const params: unknown[] = [link.user_id, link.album_id, link.media_kinds];
    const row = await this.db.queryOne<{ count: string }>(
      `select count(*)::text as count
         from album_picks p
         join user_files f on f.key = p.file_key and f.album_id = p.album_id
        where p.album_id = $2 and f.user_id = $1
          and split_part(coalesce(f.content_type, ''), '/', 1) = any($3::text[])${this.partSql(link, 'f', params)}`,
      params,
    );
    return Number(row?.count ?? 0);
  }

  /**
   * A fresh, correctly named storage link for one file of a client delivery.
   *
   * The gallery page used to carry a pre-signed storage URL per file. Those
   * expire (a tab left open overnight showed an XML "Request has expired"),
   * and any defect in the signed header surfaces as a raw storage error page
   * on the client's phone. Pointing the button at this permanent route instead
   * means the signature is made at the moment of the click, from the same
   * scope checks as the page, and a failure becomes a page we can word.
   */
  async downloadLocation(token: string, fileId: string): Promise<string> {
    const { key, name } = await this.downloadTarget(token, fileId);
    const url = await this.storage.mediaUrl(key, DOWNLOAD_URL_TTL_SECONDS, name);
    if (!url) throw new NotFoundException('That file is not available');
    return url;
  }

  /**
   * Which object a download button means, and what it saves as. Same scope
   * checks as the page.
   *
   * `ownerId` and `sizeBytes` are for metering the owner's download allowance
   * and are never sent to the client.
   */
  async downloadTarget(
    token: string,
    fileId: string,
  ): Promise<{ key: string; name: string; ownerId: string; sizeBytes: number }> {
    const link = await this.linkFor(token);
    if (link.purpose !== 'client') {
      throw new ForbiddenException('Downloads are only available on a client link');
    }
    // Numbered exactly as the page and the zip number them, so the file saves
    // under the same name everywhere.
    const params: unknown[] = [link.user_id, link.album_id, link.media_kinds, fileId];
    const row = await this.db.queryOne<{ key: string; position: string; size_bytes: string | null }>(
      `with scoped as (
         select id, key, size_bytes, section_id,
                row_number() over (order by ${SORT_AT_SQL}, key) as position
           from user_files
          where user_id = $1 and album_id = $2
            and split_part(coalesce(content_type, ''), '/', 1) = any($3::text[])
       )
       select key, position, size_bytes::text as size_bytes from scoped
        where id::text = $4${this.partSql(link, 'scoped', params)}`,
      params,
    );
    if (!row) throw new NotFoundException('That file is not in this delivery');
    return {
      key: row.key,
      name: deliveryName(link.name, Number(row.position) - 1, row.key),
      ownerId: link.user_id,
      sizeBytes: Number(row.size_bytes ?? 0) || 0,
    };
  }

  /** Raw bytes of one object, for the zip to append; `from` skips that many. */
  streamFor(key: string, from = 0) {
    return this.storage.readStream(key, from);
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
    files: ZipFile[];
    /** Whose download allowance this spends. Never sent to the client. */
    ownerId: string;
  }> {
    const link = await this.linkFor(token);
    // A portfolio link offers no download. Nothing to zip is the existing
    // "Nothing to download" 404, the same answer as an empty album.
    if (link.purpose === 'portfolio') {
      return { albumName: link.name, files: [], ownerId: link.user_id };
    }
    // Numbered across the album, then cut to what the link shows, so each file
    // is named in the zip as it is on the page and in every other link.
    const params: unknown[] = [link.user_id, link.album_id, link.media_kinds];
    const files = await this.db.query<{ key: string; position: string; size_bytes: string | null }>(
      `with scoped as (
         select key, size_bytes, section_id,
                row_number() over (order by ${SORT_AT_SQL}, key) as position,
                ${SORT_AT_SQL} as sort_ts
           from user_files
          where user_id = $1
            and album_id = $2
            and split_part(coalesce(content_type, ''), '/', 1) = any($3::text[])
       )
       select key, position, size_bytes::text as size_bytes
         from scoped
        where true${this.partSql(link, 'scoped', params)}
        order by sort_ts, key`,
      params,
    );

    return {
      albumName: this.titleOf(link),
      ownerId: link.user_id,
      files: files.map((f) => ({
        key: f.key,
        name: deliveryName(link.name, Number(f.position) - 1, f.key),
        size: Number(f.size_bytes ?? 0) || 0,
      })),
    };
  }
}
