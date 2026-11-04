-- Albums wait in Recently deleted too, and what is in there frees its space.
--
-- Someone at their storage limit deleted an album to make room. The album went
-- at once, its files stayed in their library out of any album, and the meter
-- still read full, with nothing in Recently deleted to say where it had gone.
-- Deleting a workspace did no better: its files counted for its 30 days there,
-- and then stayed in the library for good.
--
-- Now deleting an album moves it to Recently deleted, as a workspace already
-- does, and its files go with it. Whatever is in Recently deleted no longer
-- counts toward storage, so the room is there at once. Restoring brings it
-- back if the room is still there, and after 30 days the sweep deletes the
-- files for good along with the album or workspace that held them.
--
--   albums.deleted_at  When it was deleted. While set, the album is in no list,
--                      nobody can open it or anything in it, its client links
--                      stop working, and its files are not counted. Its rows
--                      stay as they were, which is what makes restoring it
--                      whole.
--
--   workspaces.purge_keeps_files
--                      Set here for the workspaces already in Recently deleted.
--                      Their owners were told the files would stay in their
--                      library, so when the sweep reaches those the files do,
--                      out of any album, as before. Every workspace deleted
--                      from now on takes its files with it.
--
-- Additive, but roll forward rather than back once anything is in Recently
-- deleted: an older image does not know about albums.deleted_at and would show
-- those albums again to everyone who had them.
set local lock_timeout = '5s';

alter table albums
  add column if not exists deleted_at timestamptz;

-- The sweep's query, and the owner's Recently deleted list. Almost every row
-- is null here, so a partial index stays tiny.
create index if not exists albums_deleted_idx
  on albums (deleted_at)
  where deleted_at is not null;

alter table workspaces
  add column if not exists purge_keeps_files boolean not null default false;

update workspaces
   set purge_keeps_files = true
 where deleted_at is not null;
