-- Lets a client link expose only some media kinds — photos to the couple,
-- videos to the editor, and so on.
--
-- Defaults to everything so links issued before this migration keep showing
-- exactly what they showed yesterday.

alter table album_share_links
  add column if not exists media_kinds text[] not null
    default array['image', 'video', 'audio'];

-- The public page reads this to decide which sections to render, so a value
-- outside the known set would silently hide media rather than error.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'album_share_links_media_kinds_valid'
  ) then
    alter table album_share_links
      add constraint album_share_links_media_kinds_valid
      check (
        cardinality(media_kinds) > 0
        and media_kinds <@ array['image', 'video', 'audio']
      );
  end if;
end $$;
