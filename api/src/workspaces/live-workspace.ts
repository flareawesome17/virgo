/**
 * SQL: the album aliased `album` is in a workspace that is not in Recently
 * deleted.
 *
 * A deleted workspace keeps every row it had, so it can be restored whole
 * (101_workspace_trash.sql). Everything that reaches an album some other way
 * than through its workspace — a direct id, a client link, a portfolio card,
 * a grant, the retention sweep — has to ask this, or the album would go on
 * being reachable while its workspace is gone.
 *
 * `album` is an alias written in this codebase, never request data.
 */
export const IN_LIVE_WORKSPACE = (album: string): string =>
  `not exists (select 1 from workspaces dw
                where dw.id = ${album}.workspace_id and dw.deleted_at is not null)`;
