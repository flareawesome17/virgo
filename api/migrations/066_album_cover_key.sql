-- A cover chosen from the album's own photographs.
--
-- `cover_url` is a URL, stored and served verbatim. That only ever worked for
-- a publicly served bucket: the album media bucket is private, so the one
-- way to set a cover — uploading a separate image — produced no public URL
-- and the app said "no CDN URL is configured" instead of setting it. Picking
-- a photograph already in the album could not work either, because the only
-- URL it has is presigned and would have been saved to expire within days.
--
-- A key is what can be stored; the listing signs it on every read, the same
-- way it signs everything else. Deleting the photograph clears the choice
-- and the album falls back to its newest image, which is what it showed
-- before anyone chose.
alter table albums
  add column if not exists cover_key text references user_files(key) on delete set null;
