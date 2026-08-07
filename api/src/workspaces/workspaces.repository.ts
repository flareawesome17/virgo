import { Injectable } from '@nestjs/common';
import { OwnedRepository, type ListOptions } from '../common/owned.repository';
import { DatabaseService } from '../database/database.service';

export interface WorkspaceRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  accent_color: string;
  media_count: number;
  collaborator_count: number;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class WorkspacesRepository extends OwnedRepository<WorkspaceRow> {
  protected readonly table = 'workspaces';

  // user_id is intentionally absent: it comes from the JWT, never the body.
  protected readonly writableColumns = [
    'id',
    'name',
    'description',
    'accent_color',
  ];

  protected readonly sortableColumns = ['created_at', 'updated_at', 'name'];

  /**
   * The two counters, computed rather than stored.
   *
   * They were columns until 034 and nothing ever updated them, so every
   * workspace read "0 assets · 0 collaborators". Deriving them cannot drift:
   * delete an album, remove a collaborator, and the next read is already
   * right, with no write path to remember.
   *
   * Media is counted through albums because that is where a file's workspace
   * actually lives — `user_files` has no workspace_id, only an album_id. A
   * file with no album belongs to no workspace and is deliberately not
   * counted here; the storage screen is where unfiled uploads surface.
   *
   * Collaborators counts accepted invitations only, matching the visibility
   * rule below. A pending invite is not a collaborator, and showing it as one
   * would tell the owner they have help they do not yet have.
   */
  private readonly withCounts = `
    w.*,
    (select count(*)::int
       from user_files f
       join albums a on a.id = f.album_id
      where a.workspace_id = w.id) as media_count,
    (select count(*)::int
       from collaborators c
      where c.workspace_id = w.id and c.status = 'accepted') as collaborator_count`;

  constructor(db: DatabaseService) {
    super(db);
  }

  /**
   * Workspaces the user owns *or* has accepted an invitation to.
   *
   * OwnedRepository scopes every read to `user_id`, which is right for private
   * data but made a shared workspace invisible to the collaborator — they
   * accepted an invitation and nothing appeared in their app.
   *
   * Only accepted invitations count. A pending one must not grant access, or
   * inviting someone would be the same as adding them.
   */
  async findAll(userId: string, options: ListOptions = {}): Promise<WorkspaceRow[]> {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
    const offset = Math.max(options.offset ?? 0, 0);
    // Validated against the allow-list before interpolation — these two cannot
    // be parameterised, so they must never come straight from the request.
    const orderBy = this.sortableColumns.includes(options.orderBy ?? '')
      ? (options.orderBy as string)
      : 'created_at';
    const direction = options.direction === 'asc' ? 'ASC' : 'DESC';

    return this.db.query<WorkspaceRow>(
      `select ${this.withCounts}
         from workspaces w
        where w.user_id = $1
           or w.id in (
             select workspace_id from collaborators
              where collaborator_user_id = $1 and status = 'accepted'
           )
        order by w.${orderBy} ${direction}
        limit $2 offset $3`,
      [userId, limit, offset],
    );
  }

  async findOne(userId: string, id: string): Promise<WorkspaceRow | null> {
    return this.db.queryOne<WorkspaceRow>(
      `select ${this.withCounts}
         from workspaces w
        where w.id = $2
          and (w.user_id = $1
               or w.id in (
                 select workspace_id from collaborators
                  where collaborator_user_id = $1 and status = 'accepted'
               ))`,
      [userId, id],
    );
  }

  /**
   * Must match findAll's visibility.
   *
   * The inherited count is owner-only, so a collaborator got their shared
   * workspaces in `data` but a `total` of 0 — enough for a list header to read
   * "0 workspaces" above a populated list.
   */
  /**
   * Create and update, re-read so the counts come back.
   *
   * The base does `returning *`, which no longer includes them — they are not
   * columns any more. A client that got a workspace back without them would
   * hit `undefined.toLocaleString()` on the very next render, which is exactly
   * what mobile's workspace list does with `media_count`.
   *
   * The extra read is one indexed lookup on a path that already writes.
   */
  async create(userId: string, data: Record<string, unknown>): Promise<WorkspaceRow> {
    const created = await super.create(userId, data);
    return (await this.findOne(userId, created.id)) ?? created;
  }

  async update(
    userId: string,
    id: string,
    data: Record<string, unknown>,
  ): Promise<WorkspaceRow | null> {
    const updated = await super.update(userId, id, data);
    return updated ? await this.findOne(userId, id) : null;
  }

  async count(userId: string): Promise<number> {
    const row = await this.db.queryOne<{ count: string }>(
      `select count(*)::text as count from workspaces
        where user_id = $1
           or id in (
             select workspace_id from collaborators
              where collaborator_user_id = $1 and status = 'accepted'
           )`,
      [userId],
    );
    return Number(row?.count ?? 0);
  }
}
