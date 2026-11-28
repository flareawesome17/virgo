-- HEIC and HEIF photographs are stored as JPEGs.
--
-- An iPhone's photo arrives as HEIC, which Android, Windows and most browsers
-- cannot open: a client downloading their delivery got files nothing on their
-- phone would show. Each one is now decoded at full size and written back
-- under the same key as a JPEG (src/storage/heic/). The key stays, because
-- eight tables point at user_files.key and none of them would follow a rename;
-- the type, size and name change.
--
-- What the file was before is kept beside it, for one reason: a re-sent batch
-- is recognised by name and size (098, upload-dedup.ts), and the phone sends
-- the HEIC's name and size again, not the JPEG's.
--
--   source_name          The name it was uploaded as (IMG_1234.HEIC).
--   source_size_bytes    Its size then.
--   source_content_type  image/heic or image/heif.
--   converted_at         When the JPEG replaced it.
--
-- And the conversion's own bookkeeping, as display copies keep theirs (091):
--
--   heic_attempts        Tries so far. Given up on at five.
--   heic_next_at         Leased until, or not to be tried again before.
--   heic_error           Why the last try failed.
--
-- Additive only. Deploys roll the image back without reversing migrations,
-- and an older image neither reads nor writes these columns.
set local lock_timeout = '5s';

alter table user_files
  add column if not exists source_name text,
  add column if not exists source_size_bytes bigint,
  add column if not exists source_content_type text,
  add column if not exists converted_at timestamptz,
  add column if not exists heic_attempts smallint not null default 0,
  add column if not exists heic_next_at timestamptz,
  add column if not exists heic_error text;

-- What is still to convert, oldest first. Small: it holds only HEIC rows, and
-- each leaves it as it becomes a JPEG.
create index if not exists user_files_heic_pending_idx
  on user_files (created_at, key)
  where content_type in ('image/heic', 'image/heif');

-- The re-upload check, for a converted file: the HEIC's own name and size.
create index if not exists user_files_album_source_dedup_idx
  on user_files (album_id, source_size_bytes, lower(source_name))
  where album_id is not null and source_name is not null;

-- The HEIC a JPEG replaced, for a week.
--
-- The bucket keeps an overwritten object as an older version, so the HEIC is
-- still there after its key holds the JPEG — a way back if a conversion ever
-- turns out wrong, and a cost if it stays for ever. Each is deleted by its
-- version id once `purge_at` passes. A table of its own, not columns on
-- user_files, so a file deleted within the week still has its old version
-- found and removed.
create table if not exists replaced_versions (
  key         text        not null,
  version_id  text        not null,
  purge_at    timestamptz not null,
  created_at  timestamptz not null default now(),
  primary key (key, version_id)
);

create index if not exists replaced_versions_purge_idx
  on replaced_versions (purge_at);
