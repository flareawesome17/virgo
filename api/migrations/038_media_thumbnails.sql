-- Thumbnails for the client gallery.
--
-- The share page rendered the grid straight from the originals: a 200-photo
-- wedding at 5 MB each is a gigabyte of transfer to draw tiles 160px wide. On
-- Philippine mobile data that is the difference between a client looking at
-- their photos and a client giving up.
--
-- Nullable rather than backfilled-not-null: a thumbnail can fail to generate
-- (a corrupt file, an image sharp cannot decode) and that must degrade to
-- serving the original, not to a row that cannot be written.
alter table user_files add column if not exists thumb_key text;

-- Only images ever have one, and the gallery asks for them by album.
create index if not exists user_files_thumb_idx
  on user_files (album_id)
  where thumb_key is not null;
