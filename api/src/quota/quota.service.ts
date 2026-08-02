import { ForbiddenException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { limitsFor, toJsonLimit, type PlanLimits } from './quota.config';

export interface StoredFile {
  key: string;
  size_bytes: string;
  content_type: string | null;
  scope: string | null;
  album_id: string | null;
  created_at: Date;
}

export interface UsageSummary {
  plan: string;
  storage: { usedBytes: number; limitBytes: number | null; fileCount: number };
  workspaces: { used: number; limit: number | null };
  /** `limit` is per workspace; `used` is the total across all of them. */
  albums: { used: number; limit: number | null };
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

  private async planFor(userId: string): Promise<string> {
    const row = await this.db.queryOne<{ plan: string }>(
      'select plan from users where id = $1',
      [userId],
    );
    return row?.plan ?? 'free';
  }

  async limits(userId: string): Promise<PlanLimits> {
    return limitsFor(await this.planFor(userId));
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
    const limits = limitsFor(plan);

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
    },
  ): Promise<void> {
    await this.db.query(
      `insert into user_files (user_id, key, size_bytes, content_type, scope, album_id)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (key) do update
         set size_bytes = excluded.size_bytes,
             content_type = excluded.content_type,
             album_id = coalesce(excluded.album_id, user_files.album_id)`,
      [
        userId,
        file.key,
        file.sizeBytes,
        file.contentType ?? null,
        file.scope ?? null,
        file.albumId ?? null,
      ],
    );
  }

  /**
   * Files owned by this user, optionally narrowed to one album.
   *
   * Always filtered by user_id — the album id alone is not an authorisation
   * check, since album ids are guessable strings.
   */
  async listFiles(
    userId: string,
    filter: { albumId?: string; limit?: number } = {},
  ): Promise<StoredFile[]> {
    const params: unknown[] = [userId];
    let where = 'user_id = $1';

    if (filter.albumId) {
      params.push(filter.albumId);
      where += ` and album_id = $${params.length}`;

      // A collaborator's files are owned by the album owner, so scoping to
      // `user_id` alone left a shared album looking empty to the person
      // invited into it. Widened to the album's own owner, but only when this
      // caller genuinely has access to that album.
      where =
        `album_id = $${params.length} and (user_id = $1 or exists (
           select 1 from albums a
            join collaborators c
              on c.workspace_id = a.workspace_id
             and c.collaborator_user_id = $1
             and c.status = 'accepted'
            where a.id = $${params.length}
              and a.user_id = user_files.user_id
              and not exists (
                select 1 from album_collaborator_exclusions x
                 where x.album_id = a.id and x.collaborator_id = c.id
              )
         ))`;
    }

    params.push(Math.min(Math.max(filter.limit ?? 200, 1), 500));

    return this.db.query<StoredFile>(
      `select key, size_bytes, content_type, scope, album_id, created_at
         from user_files
        where ${where}
        order by created_at desc
        limit $${params.length}`,
      params,
    );
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
      'delete from user_files where user_id = $1 and key = $2',
      [userId, key],
    );
  }

  /** Every key this user has stored, for a full wipe. */
  async allKeys(userId: string): Promise<string[]> {
    const rows = await this.db.query<{ key: string }>(
      'select key from user_files where user_id = $1',
      [userId],
    );
    return rows.map((r) => r.key);
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
