import { Injectable } from '@nestjs/common';
import { OwnedRepository, type ListOptions } from '../common/owned.repository';
import { DatabaseService } from '../database/database.service';
import type { MediaAccess } from '../quota/quota.service';

/** Someone in a workspace, as a card or a header draws them. */
export interface WorkspacePerson {
  user_id: string;
  name: string;
  avatar_url: string | null;
  /** 'owner', or their role as a collaborator. */
  role: string;
}

export interface WorkspaceRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  accent_color: string;
  /** Null while the workspace is in use. */
  archived_at: Date | null;
  /** The album whose cover stands for the workspace, if one was chosen. */
  cover_album_id: string | null;
  created_at: Date;
  updated_at: Date;

  // Everything below is derived, and read as the person asking sees it.

  is_owner: boolean;
  /** 'owner', or the viewer's role as a collaborator. */
  my_role: string;
  owner: { id: string; name: string; avatar_url: string | null };
  /** Albums the viewer can open here: all of them for the owner, the ones granted otherwise. */
  album_count: number;
  /** Every album in the workspace, whoever can open it. */
  album_total: number;
  /** Files in the albums the viewer can open. */
  media_count: number;
  /** Of those, the ones added in the last seven days. */
  files_this_week: number;
  /** What the workspace's files take up. The owner's figure; null for anyone else. */
  storage_bytes: number | null;
  /** Accepted collaborators, not counting the owner. */
  collaborator_count: number;
  /** Everyone in it, owner included. */
  member_count: number;
  /** Invitations not yet answered. The owner's business; 0 for anyone else. */
  pending_count: number;
  /** Up to five of the people here besides the viewer, the owner first. */
  people: WorkspacePerson[];
  /** The newest thing the viewer could see happen here, or the last edit. */
  last_activity_at: Date;
}

/** One person on the members list. */
export interface WorkspaceMemberRow {
  /** The collaborator row; null for the owner, who has none. */
  id: string | null;
  user_id: string | null;
  name: string;
  avatar_url: string | null;
  role: string;
  status: 'owner' | 'accepted' | 'pending' | 'declined';
  is_you: boolean;
  /** When they were invited. The owner's is the workspace's creation. */
  invited_at: Date;
  /** When they answered; null while pending. */
  responded_at: Date | null;
  /**
   * What they have, for the owner's eyes only — a member sees who else is
   * here, not what each of them was given.
   */
  access?: {
    /** Albums they were given. */
    albums: number;
    /** The most they can do in any of them. */
    top: MediaAccess | null;
    /** Whether that is the same in every album they have. */
    uniform: boolean;
    /** The album's name when they have exactly one: "View · Delivery". */
    only_album: string | null;
    /** What albums added later give them. Null: nothing until shared. */
    new_albums: MediaAccess | null;
  };
}

/** How a list treats archived workspaces. */
export type ArchivedFilter = 'exclude' | 'only' | 'include';

/** An account's name as everyone else sees it: display name, else the email's local part. */
const NAME_OF = (alias: string) =>
  `coalesce(nullif(trim(${alias}.display_name), ''), split_part(${alias}.email, '@', 1))`;

/** Sort keys a client may ask for, and what each one sorts by. */
const ORDER_BY: Record<string, string> = {
  created_at: 'w.created_at',
  updated_at: 'w.updated_at',
  name: 'lower(w.name)',
  last_activity_at: 'last_activity_at',
};

@Injectable()
export class WorkspacesRepository extends OwnedRepository<WorkspaceRow> {
  protected readonly table = 'workspaces';

  // user_id is intentionally absent: it comes from the JWT, never the body.
  // archived_at is written by the service from `archived`, never sent as is.
  protected readonly writableColumns = [
    'id',
    'name',
    'description',
    'accent_color',
    'archived_at',
    'cover_album_id',
  ];

  protected readonly sortableColumns = Object.keys(ORDER_BY);

  constructor(db: DatabaseService) {
    super(db);
  }

  /**
   * One workspace as `$1` sees it.
   *
   * Every count is computed rather than stored, as the two original ones have
   * been since 034: nothing has to remember to update them, so nothing drifts.
   *
   * `me` is the viewer's accepted invitation, if any. Everything a member can
   * see is narrowed through it — the albums granted to them, and only those,
   * are what they count, what their "last activity" is drawn from, and what
   * the files are totalled across. Otherwise a member would learn from the
   * card how busy the albums they were not given have been.
   *
   * Files are counted through albums because that is where a file's
   * workspace lives — `user_files` has no workspace_id. A file with no album
   * belongs to no workspace.
   */
  private readonly select = `
    select w.*,
           (w.user_id = $1) as is_owner,
           case when w.user_id = $1 then 'owner' else me.role end as my_role,
           json_build_object(
             'id', o.id, 'name', ${NAME_OF('o')}, 'avatar_url', o.avatar_url
           ) as owner,
           coalesce(v.album_count, 0) as album_count,
           (select count(*)::int from albums t where t.workspace_id = w.id) as album_total,
           coalesce(v.media_count, 0) as media_count,
           coalesce(v.files_this_week, 0) as files_this_week,
           case when w.user_id = $1 then coalesce(v.storage_bytes, 0) end as storage_bytes,
           m.collaborator_count,
           m.collaborator_count + 1 as member_count,
           case when w.user_id = $1 then m.pending_count else 0 end as pending_count,
           coalesce(p.people, '[]'::json) as people,
           greatest(w.updated_at, act.last_at) as last_activity_at
      from workspaces w
      join users o on o.id = w.user_id
      left join collaborators me
        on me.workspace_id = w.id
       and me.collaborator_user_id = $1
       and me.status = 'accepted'
      left join lateral (
        select count(distinct a.id)::int as album_count,
               count(f.key)::int as media_count,
               count(f.key) filter (
                 where f.created_at > now() - interval '7 days'
               )::int as files_this_week,
               coalesce(sum(f.size_bytes), 0)::float8 as storage_bytes
          from albums a
          left join user_files f on f.album_id = a.id
         where a.workspace_id = w.id
           and (a.user_id = $1
                or a.id in (select ca.album_id from collaborator_albums ca
                             where ca.collaborator_id = me.id))
      ) v on true
      left join lateral (
        select count(*) filter (where c.status = 'accepted')::int as collaborator_count,
               count(*) filter (where c.status = 'pending')::int as pending_count
          from collaborators c
         where c.workspace_id = w.id
      ) m on true
      left join lateral (
        select json_agg(json_build_object(
                 'user_id', x.user_id, 'name', x.name,
                 'avatar_url', x.avatar_url, 'role', x.role
               ) order by x.rank, x.joined) as people
          from (
            (select o.id as user_id, ${NAME_OF('o')} as name, o.avatar_url,
                    'owner' as role, 0 as rank, w.created_at as joined
              where w.user_id <> $1)
            union all
            (select u.id, ${NAME_OF('u')}, u.avatar_url, c.role, 1,
                    coalesce(c.responded_at, c.created_at)
               from collaborators c
               join users u on u.id = c.collaborator_user_id
              where c.workspace_id = w.id
                and c.status = 'accepted'
                and c.collaborator_user_id <> $1)
            order by rank, joined
            limit 5
          ) x
      ) p on true
      left join lateral (
        select max(wa.created_at) as last_at
          from workspace_activity wa
         where wa.workspace_id = w.id
           and (w.user_id = $1
                or (wa.album_id is null and wa.kind in ('joined', 'left'))
                or wa.album_id in (select ca.album_id from collaborator_albums ca
                                    where ca.collaborator_id = me.id))
      ) act on true`;

  /**
   * Only accepted invitations count. A pending one must not grant access, or
   * inviting someone would be the same as adding them.
   */
  private readonly visible = `(w.user_id = $1 or me.id is not null)`;

  private archivedClause(filter: ArchivedFilter): string {
    if (filter === 'only') return ' and w.archived_at is not null';
    if (filter === 'exclude') return ' and w.archived_at is null';
    return '';
  }

  /**
   * Workspaces the user owns *or* has accepted an invitation to.
   *
   * Archived ones are left out unless asked for — for everyone in them, not
   * only the owner: the job is over for the whole team.
   */
  async findAll(
    userId: string,
    options: ListOptions & { archived?: ArchivedFilter } = {},
  ): Promise<WorkspaceRow[]> {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
    const offset = Math.max(options.offset ?? 0, 0);
    // From the allow-list only — an ORDER BY cannot be parameterised, so the
    // request's value is a key into it and never interpolated itself.
    const orderBy = ORDER_BY[options.orderBy ?? ''] ?? ORDER_BY.created_at;
    const direction = options.direction === 'asc' ? 'ASC' : 'DESC';

    return this.db.query<WorkspaceRow>(
      `${this.select}
        where ${this.visible}${this.archivedClause(options.archived ?? 'exclude')}
        order by ${orderBy} ${direction}, w.id
        limit $2 offset $3`,
      [userId, limit, offset],
    );
  }

  /** One workspace, archived or not — an archived one can still be opened. */
  async findOne(userId: string, id: string): Promise<WorkspaceRow | null> {
    return this.db.queryOne<WorkspaceRow>(
      `${this.select}
        where w.id = $2 and ${this.visible}`,
      [userId, id],
    );
  }

  /** Must match findAll's visibility, or a list header miscounts what is under it. */
  async count(
    userId: string,
    filters: Record<string, unknown> & { archived?: ArchivedFilter } = {},
  ): Promise<number> {
    const row = await this.db.queryOne<{ count: string }>(
      `select count(*)::text as count
         from workspaces w
         left join collaborators me
           on me.workspace_id = w.id
          and me.collaborator_user_id = $1
          and me.status = 'accepted'
        where ${this.visible}${this.archivedClause(filters.archived ?? 'exclude')}`,
      [userId],
    );
    return Number(row?.count ?? 0);
  }

  /**
   * Create and update, re-read so the derived fields come back.
   *
   * The base does `returning *`, which has none of them. A client that got a
   * workspace back without its counts would hit `undefined.toLocaleString()`
   * on the very next render, which is exactly what mobile's workspace list
   * does with `media_count`.
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

  /** Whether an album is one of this owner's, in this workspace — the only thing a cover can come from. */
  async isOwnAlbumIn(userId: string, workspaceId: string, albumId: string): Promise<boolean> {
    const row = await this.db.queryOne<{ one: number }>(
      `select 1 as one from albums
        where id = $1 and workspace_id = $2 and user_id = $3`,
      [albumId, workspaceId, userId],
    );
    return row !== null;
  }

  /**
   * Everyone on a workspace, the owner first, then members by when they
   * joined, then invitations.
   *
   * The owner sees every invitation, answered or not, and what each person
   * was given. A member sees the owner and the other members, and nothing
   * about access: who is here is shared knowledge, what each was given is the
   * owner's.
   *
   * Names come from the account rather than the copy taken at invitation, so
   * someone who has since changed their name appears under the new one.
   */
  async members(
    viewerId: string,
    workspaceId: string,
    isOwner: boolean,
  ): Promise<WorkspaceMemberRow[]> {
    const rows = await this.db.query<
      Omit<WorkspaceMemberRow, 'access'> & {
        albums: number | null;
        top: MediaAccess | null;
        levels: number | null;
        only_album: string | null;
        new_album_access: MediaAccess | null;
        rank: number;
      }
    >(
      `select null::text as id, o.id as user_id, ${NAME_OF('o')} as name,
              o.avatar_url, 'owner' as role, 'owner' as status,
              (o.id = $1) as is_you, w.created_at as invited_at,
              w.created_at as responded_at,
              null::int as albums, null::text as top, null::int as levels,
              null::text as only_album, null::text as new_album_access,
              0 as rank
         from workspaces w
         join users o on o.id = w.user_id
        where w.id = $2
       union all
       select c.id, c.collaborator_user_id,
              coalesce(${NAME_OF('u')}, c.name),
              coalesce(u.avatar_url, c.avatar_url),
              c.role, c.status,
              coalesce(c.collaborator_user_id = $1, false), c.created_at, c.responded_at,
              g.albums, g.top, g.levels, g.only_album, c.new_album_access,
              case c.status when 'accepted' then 1 when 'pending' then 2 else 3 end
         from collaborators c
         left join users u on u.id = c.collaborator_user_id
         left join lateral (
           select count(*)::int as albums,
                  (array_agg(ca.media_access order by case ca.media_access
                     when 'manage' then 3 when 'upload' then 2
                     when 'download' then 1 else 0 end desc))[1] as top,
                  count(distinct ca.media_access)::int as levels,
                  case when count(*) = 1 then max(a.name) end as only_album
             from collaborator_albums ca
             join albums a on a.id = ca.album_id
            where ca.collaborator_id = c.id
         ) g on true
        where c.workspace_id = $2
          and ($3::boolean or c.status = 'accepted')
        order by rank, invited_at`,
      [viewerId, workspaceId, isOwner],
    );

    return rows.map(({ albums, top, levels, only_album, new_album_access, rank: _rank, ...row }) => {
      if (!isOwner || row.status === 'owner') return row;
      return {
        ...row,
        access: {
          albums: albums ?? 0,
          top: top ?? null,
          uniform: (levels ?? 0) <= 1,
          only_album: only_album ?? null,
          new_albums: new_album_access ?? null,
        },
      };
    });
  }

  /**
   * Takes the caller off a workspace they were a member of.
   *
   * Only an accepted membership: an invitation is answered, not left. Their
   * grants go with the row (`on delete cascade`); anything they uploaded
   * stays, because it was always the owner's.
   */
  async leave(
    userId: string,
    workspaceId: string,
  ): Promise<{ owner_id: string; workspace_name: string; member_name: string } | null> {
    return this.db.queryOne<{ owner_id: string; workspace_name: string; member_name: string }>(
      `with gone as (
         delete from collaborators
          where workspace_id = $2
            and collaborator_user_id = $1
            and status = 'accepted'
          returning workspace_id, name
       )
       select w.user_id as owner_id, w.name as workspace_name,
              coalesce(${NAME_OF('u')}, gone.name) as member_name
         from gone
         join workspaces w on w.id = gone.workspace_id
         left join users u on u.id = $1`,
      [userId, workspaceId],
    );
  }
}
