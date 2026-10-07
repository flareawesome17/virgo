-- A showcase keeps its own copies of its pictures and films.
--
-- A piece was only a pointer to an album file: showcase_items.file_key
-- referenced user_files(key) ON DELETE CASCADE, and every URL a piece served
-- was derived from that file. So deleting the file — by hand, or by an album's
-- retention date coming round — deleted the piece, and a post the photographer
-- had chosen to show the world went quiet without a word to them.
--
-- Each piece now gets its own copies in the public bucket, under
-- users/<id>/showcases/<showcase>/, made once from the original by the
-- showcase media worker: sharp web copies of a photograph at up to 2560 px,
-- and a 1080p film with its poster. They are display copies, not originals —
-- the camera's EXIF and GPS do not survive the re-encode — and they are not
-- counted against storage. They go when the piece or the post does.
--
-- The link to the album file stays for as long as the file does, and becomes
-- null when it goes rather than taking the piece with it. Until a piece has
-- been copied it is still served from the album file, as before; existing
-- showcases are copied by the same worker, a few a minute, after this ships.

alter table showcase_items alter column file_key drop not null;

-- The foreign key's name is whatever Postgres gave the inline reference in
-- 071, so it is found rather than assumed.
do $$
declare
  fk text;
begin
  select c.conname into fk
    from pg_constraint c
   where c.conrelid = 'showcase_items'::regclass
     and c.contype = 'f'
     and c.confrelid = 'user_files'::regclass;
  if fk is not null then
    execute format('alter table showcase_items drop constraint %I', fk);
  end if;
end $$;

alter table showcase_items
  add constraint showcase_items_file_key_fkey
  foreign key (file_key) references user_files(key) on delete set null;

alter table showcase_items
  -- 'image' or 'video', written with the copies: once the file is gone there
  -- is nothing else to tell a film from a photograph.
  add column if not exists kind            text,
  -- Public-bucket keys. thumb_key is the small still every surface can draw
  -- (a photograph's 640 px copy, a film's poster); poster_key the full-size
  -- poster frame; video_key the film itself.
  add column if not exists thumb_key       text,
  add column if not exists poster_key      text,
  add column if not exists video_key       text,
  -- The pixel WIDTHS of the web copies, written as <item>-<width>.webp. Widths
  -- and not long edges: the album copies are labelled by long edge, and a
  -- client reading those as widths picked copies too narrow for a portrait.
  add column if not exists display_widths  integer[],
  add column if not exists width_px        integer,
  add column if not exists height_px       integer,
  add column if not exists duration_ms     bigint,
  -- Null until the worker has made the copies. copy_attempts and
  -- next_copy_at let a failure back off instead of being retried every
  -- minute; copy_error says why for whoever looks.
  add column if not exists copied_at       timestamptz,
  add column if not exists copy_attempts   integer not null default 0,
  add column if not exists next_copy_at    timestamptz,
  add column if not exists copy_error      text;

-- The worker's queue: pieces still to copy, oldest first.
create index if not exists showcase_items_to_copy
  on showcase_items (coalesce(next_copy_at, created_at))
  where copied_at is null;
