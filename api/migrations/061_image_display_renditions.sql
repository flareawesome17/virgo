-- Responsive display copies for photographs.
--
-- The gallery grid has had a 640 px thumbnail since 059, but opening one has
-- always served the ORIGINAL — a 6 MB camera JPEG, or a 40 MB TIFF, to fill a
-- viewport about 1400 px wide, fetched from a bucket in California. This
-- records which intermediate widths exist so the clients can ask for the one
-- they actually draw.
--
-- An array rather than a column per width: the set is a tuning decision
-- (DISPLAY_WIDTHS in media-link.service.ts) and changing it should not be a
-- migration. Empty or null both mean "none" — the clients fall back to `url`,
-- which is what they did before this existed.
--
-- Like `proxy_key` in 060, these are paths on the media volume rather than B2
-- objects, so the bucket sweep does not reach them and deletion is handled by
-- MediaLinkService.
alter table user_files
  add column if not exists display_widths integer[];

-- No requeue here, deliberately — unlike 060.
--
-- Display copies are made by ThumbnailsService on the confirm path, not by the
-- background queue, and generating them for an existing library means reading
-- every original back out of B2. That is a real egress bill and a long run, so
-- it is an operator decision rather than something a migration does on boot:
--
--   node api/scripts/backfill-thumbnails.mjs
--
-- Until it runs, older photographs simply keep serving their original on open.
