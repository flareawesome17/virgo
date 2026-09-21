-- When a photograph or film was actually taken.
--
-- The gallery groups by day, and until now the only date it had was
-- `created_at` — the moment the upload was confirmed. A wedding shot across a
-- Friday and a Saturday and uploaded on the Monday arrived as a single day
-- called "Monday", which is exactly the undifferentiated wall the day
-- headings were meant to break up.
--
-- `timestamp`, deliberately WITHOUT a time zone. This is the camera's wall
-- clock: the day and hour as the people at the event lived them. EXIF's
-- DateTimeOriginal carries no zone, and a ceremony at 16:00 in Batangas
-- belongs under that Saturday for everyone who opens the album, wherever they
-- are sitting. Converting it to an instant would move late-night reception
-- frames onto the next day for any viewer east of Manila.
--
-- Filled on the confirm path from EXIF (ThumbnailsService) and by the
-- metadata worker for films (MediaProcessingService). Null means unknown —
-- a screenshot, an export that stripped EXIF, anything uploaded before this —
-- and every reader falls back to `created_at`.
alter table user_files
  add column if not exists taken_at timestamp;

-- The album listing sorts by capture time, falling back to arrival time on
-- the same wall clock, with the key as the tiebreaker that makes the keyset
-- cursor stable. `at time zone` with a named zone is immutable, which is what
-- lets it sit in an index.
create index if not exists user_files_album_sort_idx
  on user_files (
    album_id,
    (coalesce(taken_at, created_at at time zone 'Asia/Manila')) desc,
    key desc
  )
  where album_id is not null;

-- No backfill. Reading the date for an existing library means fetching the
-- head of every original back out of B2, which is an operator decision:
--
--   docker exec virgo-api node scripts/backfill-taken-at.mjs
--
-- Until it runs, older media keeps grouping by the day it arrived, which is
-- what it did before this existed.
