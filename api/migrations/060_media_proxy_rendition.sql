-- The web-playable proxy rendition.
--
-- A 1280-long-edge H.264/AAC MP4 with the moov atom at the front, produced by
-- the media worker and written to the media host's local volume rather than
-- to B2. It is what a player is handed instead of the camera original.
--
-- Two problems it solves, in order of how often they bite:
--
--   1. The original may be HEVC, 10-bit or ProRes. No browser decodes those,
--      and the album viewer has a whole failure state saying so.
--   2. The original may be 50 Mbps when the viewer has 5, served from a
--      bucket in California when the viewer is in Manila.
--
-- Nullable, and null is not a failure — it means "no proxy yet", and every
-- player falls back to the original exactly as it does today. That is what
-- lets this ship before the media host is serving anywhere.
--
-- Note this key does NOT name a B2 object, unlike `thumb_key` and
-- `poster_key` beside it. It is a path on the media volume. Deletion is
-- therefore not handled by the bucket sweep: the key is derived from the
-- original, so StorageService unlinks it directly.
alter table user_files
  add column if not exists proxy_key text;

-- Existing films need one. Re-running the worker over them regenerates the
-- poster too, which is idempotent and quietly repairs anything that failed
-- the first time.
--
-- Video only. Audio has nothing worth re-encoding for a player that already
-- handles mp3, aac and flac, and a proxy would be pure CPU for no gain.
update user_files
   set processing_status = 'pending',
       next_processing_at = now(),
       processing_attempts = 0
 where split_part(coalesce(content_type, ''), '/', 1) = 'video'
   and proxy_key is null
   and processing_status in ('ready', 'failed');
