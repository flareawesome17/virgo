import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DatabaseService } from '../database/database.service';

/**
 * What can happen in a workspace, as far as its overview is concerned.
 *
 * Mirrored in the clients' `api/endpoints/workspaces.ts`, which word each one.
 */
export type WorkspaceActivityKind =
  /** An album was made here. */
  | 'album-created'
  /** An album was moved here from another workspace. */
  | 'album-moved'
  /** Files were added to an album. Folded per person, album and hour. */
  | 'upload'
  /** Sections were added to an album. Folded like uploads. */
  | 'sections'
  /** A client sent their picks through a share link. No actor: not an account. */
  | 'picks'
  /** The owner invited someone (`subject`). */
  | 'invited'
  /** Someone accepted an invitation. */
  | 'joined'
  /** Someone declined one. */
  | 'declined'
  /** A member left. */
  | 'left'
  /** The owner removed a member (`subject`). */
  | 'removed'
  /** The owner changed which albums a member (`subject`) has. */
  | 'shared';

/** Kinds folded into one running row per person, album and hour. */
const FOLDED: ReadonlySet<WorkspaceActivityKind> = new Set(['upload', 'sections']);

/**
 * What a member who is not the owner may see: people arriving and leaving,
 * and anything that happened in an album they were given.
 *
 * Not invitations, declines, removals or who was given what — those are the
 * owner's business, and a member reading "You removed Jun" in somebody else's
 * workspace would be reading the owner's diary.
 */
const MEMBER_VISIBLE_WITHOUT_ALBUM: readonly WorkspaceActivityKind[] = ['joined', 'left'];

/** Long enough for "what happened on this job", short enough to stay small. */
const RETENTION_DAYS = 180;

export interface WorkspaceActivityItem {
  id: string;
  kind: WorkspaceActivityKind;
  /** Files uploaded, sections added or picks sent; 1 for everything else. */
  count: number;
  data: Record<string, unknown>;
  created_at: Date;
  /** Who did it. Null for a client's picks, and for an account since deleted. */
  actor: ActivityPerson | null;
  /** Who it was done to, for invitations, removals and sharing. */
  subject: ActivityPerson | null;
  album: { id: string; name: string } | null;
}

export interface ActivityPerson {
  id: string | null;
  name: string;
  avatar_url: string | null;
  /** Their role in this workspace: 'owner', or a collaborator's role. */
  role: string | null;
  is_you: boolean;
}

interface ActivityRow {
  id: string;
  kind: WorkspaceActivityKind;
  count: number;
  data: Record<string, unknown>;
  created_at: Date;
  actor_id: string | null;
  actor_name: string | null;
  actor_avatar_url: string | null;
  actor_role: string | null;
  subject_id: string | null;
  subject_name: string | null;
  subject_avatar_url: string | null;
  subject_role: string | null;
  album_id: string | null;
  album_name: string | null;
}

/** An account's name as everyone else sees it: display name, else the email's local part. */
const NAME_OF = (alias: string) =>
  `coalesce(nullif(trim(${alias}.display_name), ''), split_part(${alias}.email, '@', 1))`;

/**
 * The feed on a workspace's overview: who uploaded what, who joined, which
 * album was made.
 *
 * Written from wherever the thing happens — albums, storage, sections, share
 * links, collaborators — and always best-effort. A failure to record that
 * something happened must never make the thing itself fail: an upload that
 * reached the bucket is not undone because its line in a feed could not be
 * written.
 */
@Injectable()
export class WorkspaceActivityService {
  private readonly logger = new Logger(WorkspaceActivityService.name);

  constructor(private readonly db: DatabaseService) {}

  /** Records one event. */
  async record(
    workspaceId: string | null | undefined,
    actorId: string | null,
    kind: WorkspaceActivityKind,
    options: {
      albumId?: string | null;
      subjectId?: string | null;
      count?: number;
      data?: Record<string, unknown>;
    } = {},
  ): Promise<void> {
    if (!workspaceId) return;
    try {
      if (FOLDED.has(kind)) {
        await this.fold(workspaceId, actorId, kind, options.albumId ?? null, options.count ?? 1);
        return;
      }
      await this.db.query(
        `insert into workspace_activity
           (workspace_id, actor_id, subject_id, kind, album_id, count, data)
         values ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
        [
          workspaceId,
          actorId,
          options.subjectId ?? null,
          kind,
          options.albumId ?? null,
          options.count ?? 1,
          JSON.stringify(options.data ?? {}),
        ],
      );
    } catch (err) {
      this.logger.warn(`Could not record ${kind} in ${workspaceId}: ${String(err)}`);
    }
  }

  /**
   * Records something done in an album, in whichever workspace holds it.
   *
   * For the callers that know the album and not the workspace: storage
   * confirming an upload, a share link's picks, a section being added.
   */
  async recordInAlbum(
    albumId: string,
    actorId: string | null,
    kind: WorkspaceActivityKind,
    count = 1,
  ): Promise<void> {
    try {
      const album = await this.db.queryOne<{ workspace_id: string }>(
        'select workspace_id from albums where id = $1',
        [albumId],
      );
      await this.record(album?.workspace_id, actorId, kind, { albumId, count });
    } catch (err) {
      this.logger.warn(`Could not record ${kind} in album ${albumId}: ${String(err)}`);
    }
  }

  /**
   * Adds to this hour's running row for this person, album and kind.
   *
   * `created_at` moves forward with each addition so the feed orders the row
   * by the last file that arrived, not the first.
   */
  private async fold(
    workspaceId: string,
    actorId: string | null,
    kind: WorkspaceActivityKind,
    albumId: string | null,
    count: number,
  ): Promise<void> {
    await this.db.query(
      `insert into workspace_activity
         (workspace_id, actor_id, kind, album_id, count, bucket)
       values ($1, $2, $3, $4, $5, date_trunc('hour', now()))
       on conflict (workspace_id, actor_id, album_id, kind, bucket)
         where bucket is not null
       do update set count = workspace_activity.count + excluded.count,
                     created_at = now()`,
      [workspaceId, actorId, kind, albumId, count],
    );
  }

  /**
   * Removes an album's history from the workspace it has just left.
   *
   * "Carlo uploaded 248 files to Ceremony" stays true of the album but not of
   * the workspace, and the people in the old workspace have lost the album
   * along with any way to open it.
   */
  async forgetAlbum(albumId: string, exceptWorkspaceId: string): Promise<void> {
    try {
      await this.db.query(
        'delete from workspace_activity where album_id = $1 and workspace_id <> $2',
        [albumId, exceptWorkspaceId],
      );
    } catch (err) {
      this.logger.warn(`Could not clear activity for album ${albumId}: ${String(err)}`);
    }
  }

  /**
   * The newest events in a workspace, as this viewer may see them.
   *
   * The caller has already established that the viewer is in the workspace
   * and whether they own it; this only narrows what a member sees.
   */
  async list(
    viewerId: string,
    workspaceId: string,
    isOwner: boolean,
    limit = 30,
  ): Promise<WorkspaceActivityItem[]> {
    const rows = await this.db.query<ActivityRow>(
      `select wa.id, wa.kind, wa.count, wa.data, wa.created_at,
              wa.actor_id, ${NAME_OF('actor')} as actor_name,
              actor.avatar_url as actor_avatar_url,
              case when wa.actor_id = w.user_id then 'owner' else actor_c.role end
                as actor_role,
              wa.subject_id, ${NAME_OF('subject')} as subject_name,
              subject.avatar_url as subject_avatar_url,
              subject_c.role as subject_role,
              wa.album_id, a.name as album_name
         from workspace_activity wa
         join workspaces w on w.id = wa.workspace_id
         left join users actor on actor.id = wa.actor_id
         left join collaborators actor_c
           on actor_c.workspace_id = wa.workspace_id
          and actor_c.collaborator_user_id = wa.actor_id
         left join users subject on subject.id = wa.subject_id
         left join collaborators subject_c
           on subject_c.workspace_id = wa.workspace_id
          and subject_c.collaborator_user_id = wa.subject_id
         left join albums a on a.id = wa.album_id
        where wa.workspace_id = $2
          and (
            $3::boolean
            or (wa.album_id is null and wa.kind = any($4::text[]))
            or wa.album_id in (
              select ca.album_id
                from collaborator_albums ca
                join collaborators me on me.id = ca.collaborator_id
               where me.collaborator_user_id = $1
                 and me.workspace_id = $2
                 and me.status = 'accepted'
            )
          )
        order by wa.created_at desc
        limit $5`,
      [viewerId, workspaceId, isOwner, MEMBER_VISIBLE_WITHOUT_ALBUM, Math.min(Math.max(limit, 1), 100)],
    );

    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      count: row.count,
      data: row.data ?? {},
      created_at: row.created_at,
      actor: person(row.actor_id, row.actor_name, row.actor_avatar_url, row.actor_role, viewerId),
      subject: person(
        row.subject_id,
        row.subject_name ?? (typeof row.data?.name === 'string' ? row.data.name : null),
        row.subject_avatar_url,
        row.subject_role ?? (typeof row.data?.role === 'string' ? row.data.role : null),
        viewerId,
      ),
      album: row.album_id ? { id: row.album_id, name: row.album_name ?? '' } : null,
    }));
  }

  /** Trims the feed nightly. At 2:30, clear of the 2am and 3am sweeps. */
  @Cron('30 2 * * *')
  async sweep(): Promise<number> {
    const rows = await this.db.query<{ id: string }>(
      `delete from workspace_activity
        where created_at < now() - make_interval(days => $1)
        returning id`,
      [RETENTION_DAYS],
    );
    return rows.length;
  }
}

function person(
  id: string | null,
  name: string | null,
  avatarUrl: string | null,
  role: string | null,
  viewerId: string,
): ActivityPerson | null {
  if (!id && !name) return null;
  return {
    id,
    name: name ?? 'Someone',
    avatar_url: avatarUrl,
    role,
    is_you: id !== null && id === viewerId,
  };
}
