-- Links stored objects to the album they belong to.
--
-- Without this, uploads landed in the bucket under users/<id>/albums/... but
-- had no association with a specific album, so album screens had nothing real
-- to list — which is why they fell back to hardcoded placeholder media.

alter table user_files
  add column album_id text references albums(id) on delete set null;

create index user_files_album_id_idx on user_files(album_id);

-- ON DELETE SET NULL rather than CASCADE: deleting an album should not silently
-- drop the accounting rows, or a user's storage usage would fall while the
-- objects are still sitting in the bucket being paid for.
