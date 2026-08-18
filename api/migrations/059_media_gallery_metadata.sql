-- Media metadata used by the album gallery and native players.
--
-- All columns are nullable or have safe defaults so existing upload clients
-- and the current library remain readable while the background worker fills
-- metadata for older objects.
alter table user_files
  add column if not exists original_name text,
  add column if not exists poster_key text,
  add column if not exists width_px integer,
  add column if not exists height_px integer,
  add column if not exists duration_ms bigint,
  add column if not exists media_title text,
  add column if not exists media_artist text,
  add column if not exists processing_status text not null default 'not_required',
  add column if not exists processing_attempts integer not null default 0,
  add column if not exists next_processing_at timestamptz,
  add column if not exists processed_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_files_processing_status_check'
  ) then
    alter table user_files add constraint user_files_processing_status_check
      check (processing_status in ('pending', 'ready', 'failed', 'not_required'));
  end if;
end $$;

-- Stable keyset pagination within an album.
create index if not exists user_files_album_created_key_idx
  on user_files (album_id, created_at desc, key desc)
  where album_id is not null;

-- Small partial queue for the scheduled metadata worker.
create index if not exists user_files_media_processing_idx
  on user_files (coalesce(next_processing_at, created_at), created_at)
  where processing_status = 'pending';

create index if not exists user_files_poster_idx
  on user_files (album_id)
  where poster_key is not null;

-- Existing video and audio objects need metadata. Images keep their current
-- thumbnails and are refreshed lazily by new confirmations/backfill tooling.
update user_files
   set processing_status = 'pending',
       next_processing_at = now()
 where split_part(coalesce(content_type, ''), '/', 1) in ('video', 'audio')
   and processing_status = 'not_required';
