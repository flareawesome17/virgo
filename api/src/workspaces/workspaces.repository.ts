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
    'media_count',
    'collaborator_count',
  ];

  protected readonly sortableColumns = ['created_at', 'updated_at', 'name'];

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
      `select * from workspaces
        where user_id = $1
           or id in (
             select workspace_id from collaborators
              where collaborator_user_id = $1 and status = 'accepted'
           )
        order by ${orderBy} ${direction}
        limit $2 offset $3`,
      [userId, limit, offset],
    );
  }

  async findOne(userId: string, id: string): Promise<WorkspaceRow | null> {
    return this.db.queryOne<WorkspaceRow>(
      `select * from workspaces
        where id = $2
          and (user_id = $1
               or id in (
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
