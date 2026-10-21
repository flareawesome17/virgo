-- Client links to part of an album: one section, or a hand-picked set of
-- files (one file is a set of one).
--
-- Until now a link always covered the whole album, narrowed only by kind of
-- media. A photographer who wanted to send the ceremony to the couple's
-- parents, or twelve frames to a magazine, had to send everything. The
-- gallery's chapter tabs are a view, not a limit: the client can open any.
--
--   scope       'album' as before, 'section' for one section of the album, or
--               'files' for the rows in album_share_link_files.
--   section_id  The section a 'section' link shows. Deleting the section
--               deletes its link: there is nothing left for it to show, and
--               quietly widening it to the album would be worse.
--   files_hash  sha256 of the selection's sorted keys, so asking twice for the
--               same selection returns the same link instead of a second one.
--
-- Every existing row is a whole-album link and keeps its meaning through the
-- default. Part links are always 'client' links: a portfolio shows an album.
--
-- An older image keeps working against this schema, with one difference: it
-- does not know about scope, so its "the album's client link" lookup could
-- return a part link once one exists. Roll forward rather than back once part
-- links are in use.
set local lock_timeout = '5s';

alter table album_share_links
  add column if not exists scope text not null default 'album',
  add column if not exists section_id text references album_sections(id) on delete cascade,
  add column if not exists files_hash text;

do $$
begin
  alter table album_share_links
    add constraint album_share_links_scope_check check (
      (scope = 'album' and section_id is null and files_hash is null)
      or (scope = 'section' and section_id is not null and files_hash is null and purpose = 'client')
      or (scope = 'files' and section_id is null and files_hash is not null and purpose = 'client')
    );
exception
  when duplicate_object then null;
end $$;

-- One live whole-album link per album and purpose, as before; part links sit
-- beside it. One live link per section; any number of selections, but one live
-- link per exact selection.
drop index if exists album_share_links_one_active_idx;
create unique index if not exists album_share_links_one_active_idx
  on album_share_links (album_id, purpose)
  where revoked_at is null and scope = 'album';
create unique index if not exists album_share_links_one_active_section_idx
  on album_share_links (section_id)
  where revoked_at is null and scope = 'section';
create unique index if not exists album_share_links_one_active_files_idx
  on album_share_links (album_id, files_hash)
  where revoked_at is null and scope = 'files';

-- What a 'files' link shows. By key, as picks are. A file deleted from storage
-- leaves its selection; one moved to another album stays in the table but no
-- longer shows, because every gallery query also requires the link's album.
create table if not exists album_share_link_files (
  link_id  uuid not null references album_share_links(id) on delete cascade,
  file_key text not null references user_files(key) on delete cascade,
  primary key (link_id, file_key)
);
