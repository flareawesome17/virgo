-- Recently deleted: a deleted workspace waits 30 days before it is gone.
--
-- On 2026-10-25 someone signed in with an owner's password and deleted a
-- workspace with one tap. Everything in it went at once, and getting it back
-- meant restoring rows from a nightly dump by hand. Deleting now moves the
-- workspace to the owner's "Recently deleted", where they can restore it with
-- its albums, members, links and files where they were. An hourly sweep
-- deletes it for real once 30 days have passed.
--
--   workspaces.deleted_at  When it was deleted. While set, the workspace is in
--                          no list, nobody can open it or anything in it, and
--                          its client links stop working. Its rows stay as
--                          they were, which is what makes restoring it whole.
--
-- workspace_deletions (100) becomes the history of each delete. The row is
-- written when the workspace is deleted, since that is when the session that
-- asked is known, and then says how it ended:
--
--   restored_at / restored_session_id  When the owner restored it, and from
--                                      which session.
--   purged_at                          When the sweep deleted it for real.
--
-- Deleting a workspace or an album also asks for the account password, or a
-- code sent by email when two-factor is on. The code is a two-factor
-- challenge like the ones for turning two-factor off, so its purpose list
-- gains 'delete'.
--
-- Additive, but roll forward rather than back once anything is in Recently
-- deleted: an older image does not know about deleted_at and would show those
-- workspaces again to everyone who was in them.
set local lock_timeout = '5s';

alter table workspaces
  add column if not exists deleted_at timestamptz;

-- The sweep's query, and the owner's Recently deleted list. Almost every row
-- is null here, so a partial index stays tiny.
create index if not exists workspaces_deleted_idx
  on workspaces (deleted_at)
  where deleted_at is not null;

alter table workspace_deletions
  add column if not exists restored_at         timestamptz,
  add column if not exists restored_session_id uuid,
  add column if not exists purged_at           timestamptz;

alter table two_factor_challenges
  drop constraint if exists two_factor_challenges_purpose_check;
alter table two_factor_challenges
  add constraint two_factor_challenges_purpose_check
  check (purpose in ('setup', 'login', 'disable', 'recovery', 'delete'));
