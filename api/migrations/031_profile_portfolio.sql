-- What a freelancer chooses to show on their public profile.

-- One table for two shapes, because they are the same thing to a reader: a
-- piece of work, in an order the owner chose. The check constraint keeps the
-- two from drifting into each other — an 'image' row with an album_id is a bug,
-- not a variation.
create table if not exists portfolio_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid        not null references users(id) on delete cascade,
  kind        text        not null check (kind in ('image', 'album')),
  -- Deleting the underlying file or album takes the portfolio entry with it,
  -- rather than leaving a card pointing at nothing.
  file_key    text        references user_files(key) on delete cascade,
  album_id    text        references albums(id) on delete cascade,
  caption     text,
  position    integer     not null default 0,
  created_at  timestamptz not null default now(),
  constraint portfolio_items_shape check (
       (kind = 'image' and file_key is not null and album_id is null)
    or (kind = 'album' and album_id is not null and file_key is null)
  )
);

-- The public read: everything for one profile, already ordered.
create index if not exists portfolio_items_user_pos
  on portfolio_items (user_id, position, created_at);

-- The same photo twice in one portfolio is a mistake, not a choice.
create unique index if not exists portfolio_items_unique_image
  on portfolio_items (user_id, file_key) where kind = 'image';
create unique index if not exists portfolio_items_unique_album
  on portfolio_items (user_id, album_id) where kind = 'album';


-- Why a share link exists.
--
-- Showcasing an album on a public profile must not reuse the link the
-- photographer sent their client. That URL was given to two people for one job;
-- publishing it from an indexable page turns a private delivery into a
-- permanent public address, and revoking one would silently break the other.
--
-- 'client' is the existing behaviour and stays the default, so every current
-- row keeps its meaning.
alter table album_share_links
  add column if not exists purpose text not null default 'client';

do $$
begin
  alter table album_share_links
    add constraint album_share_links_purpose_check
    check (purpose in ('client', 'portfolio'));
exception
  when duplicate_object then null;
end $$;

-- One live link per album *per purpose*, replacing the one-per-album rule.
-- A client link and a portfolio link can now coexist and be revoked
-- independently, which is the entire point.
drop index if exists album_share_links_one_active_idx;
create unique index if not exists album_share_links_one_active_idx
  on album_share_links (album_id, purpose)
  where revoked_at is null;
