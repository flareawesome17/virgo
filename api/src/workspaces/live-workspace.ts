/**
 * SQL: the album aliased `album` is in a workspace that is not in Recently
 * deleted.
 *
 * A deleted workspace keeps every row it had, so it can be restored whole
 * (101_workspace_trash.sql). Most callers want LIVE_ALBUM, which asks this
 * and whether the album itself was deleted.
 *
 * `album` is an alias written in this codebase, never request data.
 */
export const IN_LIVE_WORKSPACE = (album: string): string =>
  `not exists (select 1 from workspaces dw
                where dw.id = ${album}.workspace_id and dw.deleted_at is not null)`;

/**
 * SQL: the album aliased `album` is not in Recently deleted, on its own or
 * with its workspace.
 *
 * A deleted album keeps every row it had too (106_album_trash.sql).
 * Everything that reaches an album some other way than through its workspace
 * — a direct id, a client link, a portfolio card, a grant, the retention sweep
 * — has to ask this, or the album would go on being reachable while it, or
 * its workspace, is gone.
 *
 * `album` is an alias written in this codebase, never request data.
 */
export const LIVE_ALBUM = (album: string): string =>
  `${album}.deleted_at is null and ${IN_LIVE_WORKSPACE(album)}`;

/**
 * SQL: the file aliased `file` is not in Recently deleted, with its album or
 * its album's workspace. A file in no album never is.
 *
 * What counts toward storage, and what the library lists. Deleting is how
 * someone at their limit makes room, so the room has to be there at once,
 * not in 30 days; the sweep deletes the files themselves then.
 *
 * `file` is an alias written in this codebase, never request data.
 */
export const NOT_IN_TRASH = (file: string): string =>
  `not exists (select 1 from albums ta
                join workspaces tw on tw.id = ta.workspace_id
               where ta.id = ${file}.album_id
                 and (ta.deleted_at is not null or tw.deleted_at is not null))`;
