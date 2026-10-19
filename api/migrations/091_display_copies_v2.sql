-- Display copies, second generation, and the queue that remakes the first.
--
-- 061 made copies at 1024 and 2048 on the long edge, at WebP quality 80, and
-- only at the sizes a source was larger than. Photographers saw the result:
-- every modern phone drew the 2048 copy stretched to fill its screen, a 1800
-- px photograph opened at 1024, and a 900 px one opened as its original. The
-- copies are now 1024, 2048 and 3072, plus one at the photograph's own long
-- edge when it falls between those, at quality 86 (thumbnails.service.ts).
--
-- `display_version` says which generation a row's copies are. Null is
-- everything from before this migration — copies of the old kind, or none,
-- whether because they predate 061 or because the media host was not set up
-- when they were confirmed. The confirm path writes 2 from now on, and
-- DisplayBackfillService remakes the copies of every null row from its
-- original, a few a minute, oldest first. -1 is a file it gave up on after
-- `display_attempts` tries; `display_next_at` is its lease, and the wait
-- before a retry.
--
-- No backfill here: the job is the backfill, and it reads every original out
-- of B2, which is not something to do inside a migration. It can be slowed or
-- stopped with DISPLAY_BACKFILL_PER_MINUTE.
alter table user_files
  add column if not exists display_version smallint,
  add column if not exists display_attempts smallint not null default 0,
  add column if not exists display_next_at timestamptz;

-- What the claim reads. Photographs still owed their copies, in the order it
-- takes them; it shrinks to nothing as the job finishes.
create index if not exists user_files_display_backfill_idx
  on user_files (created_at, key)
  where display_version is null and content_type like 'image/%';
