-- Workspace counters that never counted anything.
--
-- `media_count` and `collaborator_count` shipped in 002 as cached integers and
-- no code ever incremented them, so every workspace has read "0 assets · 0
-- collaborators" since launch. Worse, both were on the repository's
-- `writableColumns`, which made them client-settable: mobile's create screen
-- has been posting `collaborator_count: 1` and the API storing it, so the one
-- number that was ever non-zero was a guess made by a phone.
--
-- Deriving them costs two indexed subqueries per read, and the repo already
-- made this call once — 009 chose to sum `user_files.size_bytes` rather than
-- keep a running total on `users`, for exactly this reason: "a running total
-- drifts the moment any delete path misses an update".
--
-- Dropping the columns is what makes the fix permanent. Leaving them nullable
-- or zeroed would let the next writer reintroduce the same lie.
alter table workspaces drop column if exists media_count;
alter table workspaces drop column if exists collaborator_count;

-- The two joins the derived counts walk. `collaborators (workspace_id)` and
-- `albums (workspace_id)` are already indexed from 005 and 003; this is the
-- third leg — finding a workspace's files means going through its albums.
create index if not exists user_files_album_id_not_null_idx
  on user_files (album_id) where album_id is not null;
