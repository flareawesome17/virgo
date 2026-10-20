-- What a re-uploaded file is recognised by.
--
-- A large drop that half-fails on a bad connection gets sent again whole, and
-- every file that arrived the first time was stored again under a new random
-- key, counted against the quota twice. Before a batch starts the client now
-- asks which of its files the album already holds (POST /storage/uploads/check,
-- src/storage/upload-dedup.ts), matching on name and size, which are already
-- here, and on two things recorded from now on:
--
--   etag                What B2 reported for the object on confirm's HEAD.
--                       The MD5 of a single-PUT upload; for one sent in parts,
--                       a hash of the parts' hashes with "-<parts>" on the end,
--                       so the two kinds never compare equal. No client can
--                       compute it cheaply, so the check does not use it; the
--                       duplicate report does (scripts/report-duplicate-uploads.mjs).
--
--   source_modified_at  The file's own modified time as the device reported
--                       it (File.lastModified in a browser). The phone cannot
--                       report one, so its uploads leave it null. A device
--                       clock, not ours: only ever compared with another
--                       report of the same file, never shown or sorted by.
--
-- Both nullable with no default: existing rows stay as they are, and a confirm
-- from an app that sends neither records neither. No backfill — the ETag of
-- an existing object means a HEAD per object against B2, and its modified
-- time is not knowable at all.
--
-- Additive only. Deploys roll the image back without reversing migrations, and
-- an older image neither reads nor writes these columns.
set local lock_timeout = '5s';

alter table user_files
  add column if not exists etag text,
  add column if not exists source_modified_at timestamptz;

-- The check: one album, a few hundred (size, name) pairs at a time. Size
-- first, because it is nearly unique on its own and compares as an integer;
-- the lowered name is what makes the match case-insensitive without a scan.
-- Not CONCURRENTLY: every migration runs inside a transaction (migrator.ts).
-- The build holds off inserts into user_files — confirms — for as long as it
-- takes, which at this table's size is a moment.
create index if not exists user_files_album_dedup_idx
  on user_files (album_id, size_bytes, lower(original_name))
  where album_id is not null;
