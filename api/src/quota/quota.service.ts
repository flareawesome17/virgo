import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { limitsFor, toJsonLimit, type PlanLimits } from './quota.config';

export interface StoredFile {
  key: string;
  size_bytes: string;
  content_type: string | null;
  scope: string | null;
  album_id: string | null;
  created_at: Date;
  original_name: string | null;
  thumb_key: string | null;
  poster_key: string | null;
  /** A path on the media volume, not a B2 object. See MediaLinkService. */
  proxy_key: string | null;
  width_px: number | null;
  height_px: number | null;
  duration_ms: string | null;
  media_title: string | null;
  media_artist: string | null;
  processing_status: 'pending' | 'ready' | 'failed' | 'not_required';
}

export type StoredMediaKind = 'image' | 'video' | 'audio' | 'other';

export interface StoredFilePage {
  rows: StoredFile[];
  total: number;
  nextCursor: string | null;
  counts: Record<StoredMediaKind, number>;
}

export interface UsageSummary {
  plan: string;
  storage: { usedBytes: number; limitBytes: number | null; fileCount: number };
  workspaces: { used: number; limit: number | null };
  /** `limit` is per workspace; `used` is the total across all of them. */
  albums: { used: number; limit: number | null };
  /**
   * How much of each limit above came from claimed promos rather than the plan.
   *
   * Reported rather than left for a client to derive: the alternative is every
   * screen fetching the plan catalogue and subtracting, and the storage screen
   * doing that arithmetic wrong is how "20 GB on the free plan" ended up on
   * screen for a plan that gives 15.
   *
   * All zeroes for an account that has claimed nothing, which is most of them.
   */
  bonus: { storageBytes: number; workspaces: number; albumsPerWorkspace: number };
}

/** What a collaborator may do with the media in an album they were granted. */
export type MediaAccess = 'view' | 'download' | 'upload' | 'manage';

/** Ordered, so a check is "at least this much" rather than an exact match. */
export const MEDIA_ACCESS_RANK: Record<MediaAccess, number> = {
  view: 0,
  download: 1,
  upload: 2,
  manage: 3,
};

/** 'owner' outranks every grant: it is the person whose album it is. */
export type ResolvedAccess = MediaAccess | 'owner' | null;

export function accessAllows(access: ResolvedAccess, required: MediaAccess): boolean {
  if (access === 'owner') return true;
  if (!access) return false;
  return MEDIA_ACCESS_RANK[access] >= MEDIA_ACCESS_RANK[required];
}

/**
 * Plan limit accounting and enforcement.
 *
 * Enforcement lives on the server because the client cannot be trusted with
 * it — hiding a "New workspace" button is presentation, not a limit.
 */
@Injectable()
export class QuotaService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * What this user may do with one album's media.
   *
   * Their own album is 'owner'. Otherwise it is the grant from an accepted
   * invitation, or null. Both halves matter: a grant without an accepted
   * invitation is somebody who never agreed to be there, and an accepted
   * invitation without a grant is a workspace member who was not given this
   * particular album.
   */
  async accessForAlbum(userId: string, albumId: string): Promise<ResolvedAccess> {
    const row = await this.db.queryOne<{
      owner: boolean;
      media_access: MediaAccess | null;
    }>(
      `select (a.user_id = $1) as owner, ca.media_access
         from albums a
         left join collaborators c
           on c.workspace_id = a.workspace_id
          and c.collaborator_user_id = $1
          and c.status = 'accepted'
         left join collaborator_albums ca
           on ca.collaborator_id = c.id
          and ca.album_id = a.id
        where a.id = $2
        limit 1`,
      [userId, albumId],
    );
    if (!row) return null;
    if (row.owner) return 'owner';
    return row.media_access ?? null;
  }

  /**
   * What this user may do with one stored object.
   *
   * Resolved through the file's album rather than its key prefix. The prefix
   * says who uploaded it, which stopped being the same question as who may
   * read it the moment albums could be shared. Files with no album — avatars,
   * anything not yet filed — fall back to the uploader.
   */
  async accessForKey(userId: string, key: string): Promise<ResolvedAccess> {
    const row = await this.db.queryOne<{
      user_id: string;
      album_id: string | null;
    }>('select user_id, album_id from user_files where key = $1', [key]);

    // Unknown key: nothing to authorise against, so fall back to the prefix.
    // An upload in flight has no row yet, and its key was minted for this
    // caller, so this is the only case where the prefix is the whole answer.
    if (!row) return key.startsWith(`users/${userId}/`) ? 'owner' : null;

    if (row.user_id === userId) return 'owner';
    if (!row.album_id) return null;
    return this.accessForAlbum(userId, row.album_id);
  }

  /**
   * Who the storage for an album is billed to, and whose library it joins.
   *
   * A collaborator uploading into someone else's album must not spend their
   * own plan's storage on it, and the album owner must be able to see what
   * landed in their album. Both follow from attributing the row to the owner.
   */
  async albumOwner(albumId: string): Promise<string | null> {
    const row = await this.db.queryOne<{ user_id: string }>(
      'select user_id from albums where id = $1',
      [albumId],
    );
    return row?.user_id ?? null;
  }

  private async planFor(userId: string): Promise<string> {
    const row = await this.db.queryOne<{ plan: string }>(
      'select plan from users where id = $1',
      [userId],
    );
    return row?.plan ?? 'free';
  }

  /**
   * What this account has been given on top of its plan.
   *
   * Summed from claimed grants rather than kept in a counter column on users.
   * A counter is one bad write away from being wrong with nothing to
   * reconcile against; this can always be explained — every byte traces to a
   * promo somebody claimed on a date.
   *
   * Unclaimed grants are worth nothing, and an expired one stops counting
   * even if it was claimed late: `claimed_at` is only ever set while the
   * grant is live, so the expiry check here is belt and braces.
   */
  private async bonusFor(userId: string): Promise<PlanLimits> {
    const row = await this.db.queryOne<{
      storage_bytes: string;
      extra_workspaces: string;
      extra_albums: string;
    }>(
      `select coalesce(sum(p.storage_bytes), 0)::text              as storage_bytes,
              coalesce(sum(p.extra_workspaces), 0)::text           as extra_workspaces,
              coalesce(sum(p.extra_albums_per_workspace), 0)::text as extra_albums
         from promo_grants g
         join promos p on p.id = g.promo_id
        where g.user_id = $1
          and g.claimed_at is not null`,
      [userId],
    );
    return {
      storageBytes: Number(row?.storage_bytes ?? 0),
      workspaces: Number(row?.extra_workspaces ?? 0),
      albumsPerWorkspace: Number(row?.extra_albums ?? 0),
    };
  }

  /**
   * The plan, plus anything claimed on top of it.
   *
   * Every quota check in the app goes through here, so a claimed promo takes
   * effect everywhere at once — uploads, workspace creation, album creation —
   * without each call site learning about promos.
   */
  async limits(userId: string): Promise<PlanLimits> {
    const [plan, bonus] = await Promise.all([
      this.planFor(userId).then(limitsFor),
      this.bonusFor(userId),
    ]);
    return {
      storageBytes: plan.storageBytes + bonus.storageBytes,
      workspaces: plan.workspaces + bonus.workspaces,
      albumsPerWorkspace: plan.albumsPerWorkspace + bonus.albumsPerWorkspace,
    };
  }

  /** Bytes currently stored, summed from the recorded file rows. */
  async storageUsed(userId: string): Promise<number> {
    const row = await this.db.queryOne<{ total: string }>(
      `select coalesce(sum(size_bytes), 0)::text as total
         from user_files where user_id = $1`,
      [userId],
    );
    return Number(row?.total ?? 0);
  }

  private async countRows(table: 'workspaces' | 'albums', userId: string) {
    const row = await this.db.queryOne<{ count: string }>(
      `select count(*)::text as count from ${table} where user_id = $1`,
      [userId],
    );
    return Number(row?.count ?? 0);
  }

  async summary(userId: string): Promise<UsageSummary> {
    const plan = await this.planFor(userId);
    // this.limits, not limitsFor(plan): the storage screen has to show what
    // the account actually gets, or claiming a promo would raise the real
    // ceiling while the number on screen kept quoting the plan.
    const limits = await this.limits(userId);
    const bonus = await this.bonusFor(userId);

    const [usedBytes, fileCount, workspaces, albums] = await Promise.all([
      this.storageUsed(userId),
      this.db
        .queryOne<{ count: string }>(
          'select count(*)::text as count from user_files where user_id = $1',
          [userId],
        )
        .then((r) => Number(r?.count ?? 0)),
      this.countRows('workspaces', userId),
      this.countRows('albums', userId),
    ]);

    return {
      plan,
      storage: {
        usedBytes,
        limitBytes: toJsonLimit(limits.storageBytes),
        fileCount,
      },
      workspaces: { used: workspaces, limit: toJsonLimit(limits.workspaces) },
      albums: { used: albums, limit: toJsonLimit(limits.albumsPerWorkspace) },
      bonus: {
        storageBytes: bonus.storageBytes,
        workspaces: bonus.workspaces,
        albumsPerWorkspace: bonus.albumsPerWorkspace,
      },
    };
  }

  /** Throws 403 when creating another workspace would exceed the plan. */
  async assertCanCreateWorkspace(userId: string): Promise<void> {
    const limits = await this.limits(userId);
    if (!Number.isFinite(limits.workspaces)) return;
    const used = await this.countRows('workspaces', userId);
    if (used >= limits.workspaces) {
      throw new ForbiddenException(
        `Your plan includes ${limits.workspaces} workspace${limits.workspaces === 1 ? '' : 's'}. Upgrade to add more.`,
      );
    }
  }

  /**
   * Album limits are per workspace, not global.
   *
   * "2 workspaces with 5 albums each" is how the plan is sold, and a global cap
   * would let one workspace consume the whole allowance and leave the second
   * unusable.
   */
  async assertCanCreateAlbum(userId: string, workspaceId?: string): Promise<void> {
    const limits = await this.limits(userId);
    if (!Number.isFinite(limits.albumsPerWorkspace)) return;

    const row = await this.db.queryOne<{ count: string }>(
      workspaceId
        ? `select count(*)::text as count from albums
            where user_id = $1 and workspace_id = $2`
        : 'select count(*)::text as count from albums where user_id = $1',
      workspaceId ? [userId, workspaceId] : [userId],
    );
    const used = Number(row?.count ?? 0);

    if (used >= limits.albumsPerWorkspace) {
      const n = limits.albumsPerWorkspace;
      throw new ForbiddenException(
        `Your plan includes ${n} album${n === 1 ? '' : 's'} per workspace. Upgrade to add more.`,
      );
    }
  }

  /**
   * Checked before a presigned URL is issued — once the client holds a signed
   * URL the server is no longer in the loop, so this is the last chance to
   * refuse. The declared size is already pinned into the signature, so it
   * cannot be understated here and exceeded later.
   */
  async assertCanStore(userId: string, additionalBytes: number): Promise<void> {
    const limits = await this.limits(userId);
    if (!Number.isFinite(limits.storageBytes)) return;

    const used = await this.storageUsed(userId);
    if (used + additionalBytes > limits.storageBytes) {
      const gb = (limits.storageBytes / 1024 ** 3).toFixed(0);
      const remaining = Math.max(limits.storageBytes - used, 0);
      throw new ForbiddenException(
        `That upload would exceed your ${gb} GB of storage. ${formatBytes(remaining)} remaining.`,
      );
    }
  }

  /** Records a confirmed upload. Idempotent on `key`. */
  async recordFile(
    userId: string,
    file: {
      key: string;
      sizeBytes: number;
      contentType?: string;
      scope?: string;
      albumId?: string | null;
      originalName?: string | null;
    },
  ): Promise<void> {
    const kind = file.contentType?.split('/')[0];
    const processingStatus = ['image', 'video', 'audio'].includes(kind ?? '')
      ? 'pending'
      : 'not_required';
    await this.db.query(
      `insert into user_files
         (user_id, key, size_bytes, content_type, scope, album_id,
          original_name, processing_status, next_processing_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8,
               case when $8 = 'pending' then now() else null end)
       on conflict (key) do update
         set size_bytes = excluded.size_bytes,
             content_type = excluded.content_type,
             album_id = coalesce(excluded.album_id, user_files.album_id),
             original_name = coalesce(excluded.original_name, user_files.original_name),
             processing_status = case
               when user_files.content_type is distinct from excluded.content_type
                 then excluded.processing_status
               else user_files.processing_status
             end,
             next_processing_at = case
               when user_files.content_type is distinct from excluded.content_type
                 and excluded.processing_status = 'pending' then now()
               else user_files.next_processing_at
             end`,
      [
        userId,
        file.key,
        file.sizeBytes,
        file.contentType ?? null,
        file.scope ?? null,
        file.albumId ?? null,
        file.originalName ?? null,
        processingStatus,
      ],
    );
  }

  /**
   * Files owned by this user, or — when an album is named — everything in
   * that album.
   *
   * **Callers must resolve access to `filter.albumId` first.** Album ids are
   * guessable strings, so this method is not self-authorising;
   * `StorageService.listFiles` calls `accessForAlbum` before it gets here.
   *
   * Within an album the uploader is deliberately not part of the filter. A
   * shared album is one pile of media: scoping to `user_id` hid a
   * collaborator's upload from the album's own owner, because that row is not
   * theirs.
   */
  async listFiles(
    userId: string,
    filter: {
      albumId?: string;
      limit?: number;
      cursor?: string;
      kind?: StoredMediaKind;
    } = {},
  ): Promise<StoredFilePage> {
    // Built as one or the other, never both: an album query must not also
    // carry `userId`, or $1 goes unreferenced and Postgres refuses the
    // statement outright with "could not determine data type of parameter $1".
    const params: unknown[] = [];
    let where: string;

    if (filter.albumId) {
      params.push(filter.albumId);
      where = `album_id = $${params.length}`;
    } else {
      params.push(userId);
      where = `user_id = $${params.length}`;
    }

    const scopeWhere = where;
    if (filter.kind) {
      params.push(filter.kind);
      where += ` and ${mediaKindSql('content_type')} = $${params.length}`;
    }

    if (filter.cursor) {
      const cursor = decodeFileCursor(filter.cursor);
      params.push(cursor.createdAt, cursor.key);
      where += ` and (created_at, key) < ($${params.length - 1}::timestamptz, $${params.length}::text)`;
    }

    const limit = Math.min(Math.max(filter.limit ?? 60, 1), 100);
    params.push(limit + 1);

    const rows = await this.db.query<StoredFile>(
      `select key, size_bytes, content_type, scope, album_id, created_at,
              original_name, thumb_key, poster_key, proxy_key, width_px, height_px,
              duration_ms, media_title, media_artist, processing_status
         from user_files
        where ${where}
        order by created_at desc, key desc
        limit $${params.length}`,
      params,
    );

    const countParams: unknown[] = filter.albumId ? [filter.albumId] : [userId];
    const summary = await this.db.queryOne<{
      total: string;
      image_count: string;
      video_count: string;
      audio_count: string;
      other_count: string;
    }>(
      `select count(*)::text as total,
              count(*) filter (where ${mediaKindSql('content_type')} = 'image')::text as image_count,
              count(*) filter (where ${mediaKindSql('content_type')} = 'video')::text as video_count,
              count(*) filter (where ${mediaKindSql('content_type')} = 'audio')::text as audio_count,
              count(*) filter (where ${mediaKindSql('content_type')} = 'other')::text as other_count
         from user_files
        where ${scopeWhere}`,
      countParams,
    );

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const last = pageRows.at(-1);
    const filteredTotal = filter.kind
      ? {
          image: summary?.image_count,
          video: summary?.video_count,
          audio: summary?.audio_count,
          other: summary?.other_count,
        }[filter.kind]
      : summary?.total;
    return {
      rows: pageRows,
      total: Number(filteredTotal ?? 0),
      counts: {
        image: Number(summary?.image_count ?? 0),
        video: Number(summary?.video_count ?? 0),
        audio: Number(summary?.audio_count ?? 0),
        other: Number(summary?.other_count ?? 0),
      },
      nextCursor:
        hasMore && last ? encodeFileCursor(last.created_at, last.key) : null,
    };
  }

  /** Files with no album yet — uploaded before an album was chosen. */
  async listUnassigned(userId: string, limit = 200): Promise<StoredFile[]> {
    return this.db.query<StoredFile>(
      `select key, size_bytes, content_type, scope, album_id, created_at
         from user_files
        where user_id = $1 and album_id is null and scope = 'albums'
        order by created_at desc
        limit $2`,
      [userId, Math.min(Math.max(limit, 1), 500)],
    );
  }

  /**
   * Points existing files at an album.
   *
   * The album is re-checked against `albums.user_id` rather than trusted from
   * the request: an album id is a guessable string, so accepting it as given
   * would let a caller file their objects into someone else's album.
   *
   * Returns the number of rows actually moved.
   */
  async attachToAlbum(
    userId: string,
    keys: string[],
    albumId: string,
  ): Promise<number> {
    if (keys.length === 0) return 0;

    const album = await this.db.queryOne<{ id: string }>(
      'select id from albums where id = $1 and user_id = $2',
      [albumId, userId],
    );
    if (!album) {
      throw new ForbiddenException('That album does not exist');
    }

    const rows = await this.db.query<{ key: string }>(
      `update user_files
          set album_id = $3
        where user_id = $1 and key = any($2::text[])
        returning key`,
      [userId, keys, albumId],
    );
    return rows.length;
  }

  /**
   * Storage split by album and by media type, for the storage screen.
   *
   * Computed in SQL rather than by pulling every row to the client — the file
   * list is capped at 500 by listFiles, so summing there would quietly
   * under-report once a user passes that many objects.
   */
  async breakdown(userId: string): Promise<{
    byAlbum: { albumId: string | null; name: string | null; bytes: number; files: number }[];
    byType: { kind: string; bytes: number; files: number }[];
  }> {
    const byAlbum = await this.db.query<{
      album_id: string | null;
      name: string | null;
      bytes: string;
      files: string;
    }>(
      `select f.album_id,
              a.name,
              coalesce(sum(f.size_bytes), 0)::text as bytes,
              count(*)::text as files
         from user_files f
         left join albums a on a.id = f.album_id and a.user_id = f.user_id
        where f.user_id = $1
        group by f.album_id, a.name
        order by sum(f.size_bytes) desc`,
      [userId],
    );

    // split_part on '/' turns 'image/jpeg' into 'image'; anything without a
    // recorded content type lands in 'other' rather than an empty label.
    const byType = await this.db.query<{
      kind: string;
      bytes: string;
      files: string;
    }>(
      `select case
                when content_type is null then 'other'
                when split_part(content_type, '/', 1) in ('image', 'video', 'audio')
                  then split_part(content_type, '/', 1)
                else 'other'
              end as kind,
              coalesce(sum(size_bytes), 0)::text as bytes,
              count(*)::text as files
         from user_files
        where user_id = $1
        group by 1
        order by sum(size_bytes) desc`,
      [userId],
    );

    return {
      byAlbum: byAlbum.map((r) => ({
        albumId: r.album_id,
        name: r.name,
        bytes: Number(r.bytes),
        files: Number(r.files),
      })),
      byType: byType.map((r) => ({
        kind: r.kind,
        bytes: Number(r.bytes),
        files: Number(r.files),
      })),
    };
  }

  /** Drops the accounting row when an object is deleted. */
  async forgetFile(userId: string, key: string): Promise<void> {
    await this.db.query(
      // Access was already resolved by StorageService. Deleting by key is
      // necessary for a collaborator with manage access because the row is
      // billed to the album owner, not to that collaborator.
      'delete from user_files where key = $1',
      [key],
    );
  }

  /** Original keys plus any thumbnail/poster objects stored beside them. */
  async objectAndDerivedKeys(keys: readonly string[]): Promise<string[]> {
    if (keys.length === 0) return [];
    const rows = await this.db.query<{
      key: string;
      thumb_key: string | null;
      poster_key: string | null;
    }>(
      `select key, thumb_key, poster_key
         from user_files
        where key = any($1::text[])`,
      [keys],
    );
    const expanded = rows.flatMap((row) => [row.key, row.thumb_key, row.poster_key]);
    return [...new Set(expanded.filter((key): key is string => !!key))];
  }

  /** Every key this user has stored, for a full wipe. */
  async allKeys(userId: string): Promise<string[]> {
    const rows = await this.db.query<{
      key: string;
      thumb_key: string | null;
      poster_key: string | null;
    }>(
      'select key, thumb_key, poster_key from user_files where user_id = $1',
      [userId],
    );
    return [
      ...new Set(
        rows
          .flatMap((row) => [row.key, row.thumb_key, row.poster_key])
          .filter((key): key is string => !!key),
      ),
    ];
  }

  /**
   * Clears the accounting rows for the given keys.
   *
   * Takes the keys that were actually deleted from the bucket rather than
   * wiping the whole table: if some objects fail to delete, their rows must
   * stay so the space is still counted against the quota.
   */
  async forgetFiles(userId: string, keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;
    const rows = await this.db.query<{ key: string }>(
      `delete from user_files
        where user_id = $1 and key = any($2::text[])
        returning key`,
      [userId, keys],
    );
    return rows.length;
  }
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function mediaKindSql(column: string): string {
  return `case
    when coalesce(${column}, '') like 'image/%' then 'image'
    when coalesce(${column}, '') like 'video/%' then 'video'
    when coalesce(${column}, '') like 'audio/%' then 'audio'
    else 'other'
  end`;
}

export function encodeFileCursor(createdAt: Date, key: string): string {
  return Buffer.from(
    JSON.stringify({ createdAt: createdAt.toISOString(), key }),
    'utf8',
  ).toString('base64url');
}

export function decodeFileCursor(value: string): { createdAt: string; key: string } {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as {
      createdAt?: unknown;
      key?: unknown;
    };
    if (
      typeof parsed.createdAt !== 'string' ||
      !Number.isFinite(Date.parse(parsed.createdAt)) ||
      typeof parsed.key !== 'string' ||
      parsed.key.length === 0 ||
      parsed.key.length > 1024
    ) {
      throw new Error('Invalid cursor fields');
    }
    return { createdAt: parsed.createdAt, key: parsed.key };
  } catch {
    throw new BadRequestException('Invalid file cursor');
  }
}
