-- Sections, client picks, and zips of a selection.
--
-- SECTIONS. An album used to have exactly one axis below it — Photos, Films,
-- Audio — which is the one axis nobody organises a shoot by. A wedding is
-- prep, ceremony, reception and speeches, and the ceremony's photographs and
-- the ceremony's film belong together. A section is a named, ordered group
-- inside one album that holds media of any kind; the kind becomes a filter.
--
-- A file with no section is simply unsorted, so every album that exists today
-- keeps working unchanged: nothing is required to be filed anywhere.
create table if not exists album_sections (
  id          text        primary key,
  album_id    text        not null references albums(id) on delete cascade,
  name        text        not null check (char_length(btrim(name)) between 1 and 60),
  -- Left to right, as the photographer arranged them. Gaps are fine; only the
  -- order means anything.
  position    integer     not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- The target of the composite key below.
  unique (id, album_id)
);

-- Two sections called "Ceremony" in one album is a mistake nobody means to
-- make, and a client choosing between them would have no way to tell.
create unique index if not exists album_sections_album_name_idx
  on album_sections (album_id, lower(btrim(name)));

create index if not exists album_sections_album_position_idx
  on album_sections (album_id, position);

drop trigger if exists album_sections_set_updated_at on album_sections;
create trigger album_sections_set_updated_at
  before update on album_sections
  for each row execute function set_updated_at();

alter table user_files
  add column if not exists section_id text;

-- Keyed on (section, album) rather than the section alone, so a file can only
-- ever sit in a section of its OWN album.
--
-- ON DELETE SET NULL (section_id) — Postgres 15+ — clears only the section
-- when one is deleted. Plain SET NULL would null album_id as well and quietly
-- evict every file in the section from its album.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_files_section_fk'
  ) then
    alter table user_files add constraint user_files_section_fk
      foreign key (section_id, album_id)
      references album_sections (id, album_id)
      on delete set null (section_id);
  end if;
end $$;

-- A file that leaves its album leaves its section with it.
--
-- The key above cannot do this alone. Deleting an album nulls `album_id` on
-- its files (migration 010) before the section cascade reaches them, and with
-- album_id null the composite key no longer matches — so the section id was
-- left behind pointing at nothing, and the next attempt to file that upload
-- into a different album failed the key check. Clearing it on any change of
-- album covers that, and a plain move between albums too.
create or replace function user_files_clear_section() returns trigger
language plpgsql as $$
begin
  new.section_id := null;
  return new;
end $$;

drop trigger if exists user_files_clear_section on user_files;
create trigger user_files_clear_section
  before update of album_id on user_files
  for each row
  when (old.album_id is distinct from new.album_id)
  execute function user_files_clear_section();

-- Per-section counts and the section filter both start from the album.
create index if not exists user_files_album_section_idx
  on user_files (album_id, section_id)
  where album_id is not null;

-- PICKS. The client marks the frames they want; the photographer sees which.
-- Until now the delivery page could be viewed and downloaded and nothing else,
-- so "which ones do you want retouched" happened over chat, as a list of file
-- numbers typed out by hand.
--
-- Per album rather than per link: one client link exists at a time, and a
-- photographer who replaces the link should not lose the choices already made
-- through the old one. `link_id` records which link a pick arrived through,
-- for the record, and survives that link being revoked.
create table if not exists album_picks (
  album_id   text        not null references albums(id) on delete cascade,
  file_key   text        not null references user_files(key) on delete cascade,
  link_id    uuid        references album_share_links(id) on delete set null,
  picked_at  timestamptz not null default now(),
  primary key (album_id, file_key)
);

-- When the client last pressed "Send", so the page can say it was sent and
-- the photographer can tell a finished selection from one still in progress.
alter table album_share_links
  add column if not exists picks_sent_at timestamptz;

-- ZIP TICKETS. A download of a chosen set of files, for the signed-in app.
--
-- The web app authenticates with a bearer header, which a browser does not
-- send on a plain navigation — and a navigation is the only way to hand a
-- multi-gigabyte zip to the browser's own download manager rather than to
-- JavaScript memory. So the app asks for a ticket over its authenticated
-- channel, and the ticket is what the navigation carries. Short-lived, and
-- bound to the keys it was issued for.
create table if not exists media_zip_tickets (
  token       text        primary key,
  user_id     uuid        not null references users(id) on delete cascade,
  album_id    text        not null references albums(id) on delete cascade,
  keys        text[]      not null,
  expires_at  timestamptz not null
);

create index if not exists media_zip_tickets_expires_idx
  on media_zip_tickets (expires_at);
