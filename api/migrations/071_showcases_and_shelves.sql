-- Showcases, and the shelves people keep other people's work on.
--
-- Two halves of a creative's presence. `showcases` is what you made: a post
-- holding several pieces of media, a title, and a note on how it was made.
-- `shelves` is what you respond to: other people's showcases, kept publicly.
--
-- `portfolio_items` (031) cannot express either. It is one row per single image
-- OR per whole album, so it has no room for a set, and it only ever points at
-- the owner's own files.
--
-- Additive only, and nothing is migrated. The Windows deploy runs migrations
-- before it starts the new image and rolls the image back without reversing
-- them when the health gate fails, so a release that only CREATEs is a release
-- that rolls back cleanly. `portfolio_items` is untouched and keeps serving
-- every profile exactly as it does today; moving those rows onto showcases is
-- its own migration, once the read path that would serve them exists and has
-- been seen working.
--
-- The same bounded wait as 069 and 070. Every statement below creates a new
-- object, so nothing here waits on a lock over user data — the timeout is here
-- so a surprise (an extension lock, a concurrent DDL) fails the deploy cleanly
-- rather than queueing. SET LOCAL holds for this file's transaction only; the
-- migrator runs each file in one.
set local lock_timeout = '5s';


-- ── what you made ────────────────────────────────────────────────────────────

create table if not exists showcases (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid        not null references users(id) on delete cascade,
  title       text,
  caption     text,

  -- How it was made, in the maker's words. Typed, never read out of the file:
  -- the originals' EXIF is stripped on the way out precisely so a public photo
  -- cannot give away where somebody was standing, and lifting the camera's own
  -- record into a public column would undo that. What a photographer chooses
  -- to tell you is not the same thing as what the camera recorded.
  craft_note  text,
  -- Short facts beside the note — "85mm", "f/1.4", "Backlit". A text[] rather
  -- than its own table because nothing joins on them, they are never counted,
  -- and they are displayed in the order they were entered.
  craft_tags  text[]      not null default '{}',

  category    text,
  location    text,

  -- 'connections' is not "friends only" for its own sake: somebody testing a
  -- set on people they trust before it goes to the open web is the case this
  -- exists for. There is no 'private' — an unpublished showcase is one with a
  -- null published_at, which is a different thing from a visible-to-nobody one.
  visibility  text        not null default 'public'
                check (visibility in ('public', 'connections')),

  -- Off by default and deliberately so. A creative's originals are the product,
  -- and the public read path serves a rendition rather than the file either way;
  -- this decides whether a download is offered at all.
  allow_downloads boolean not null default false,
  allow_comments  boolean not null default true,
  show_hire       boolean not null default true,

  -- Null until it is posted. unpublished_at is kept rather than clearing
  -- published_at, so taking a showcase down and putting it back does not
  -- reorder somebody's profile or lose when it first went out.
  published_at   timestamptz,
  unpublished_at timestamptz,

  -- Maintained by the trigger below. Denormalised because the feed both ranks
  -- on it and prints it, and a count(*) over shelf_items per feed row is the
  -- one query that would not survive a scroll.
  kept_count  integer     not null default 0,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- A profile: everything one person has posted, newest first.
create index if not exists showcases_user_published
  on showcases (user_id, published_at desc nulls last, created_at desc);

-- The feed. Partial, so the index holds only rows the feed can ever serve —
-- posted, still up, and not limited to connections.
create index if not exists showcases_feed
  on showcases (published_at desc)
  where visibility = 'public' and published_at is not null and unpublished_at is null;

-- Ranking "for you" by what people kept, within what is servable.
create index if not exists showcases_feed_kept
  on showcases (kept_count desc, published_at desc)
  where visibility = 'public' and published_at is not null and unpublished_at is null;


create table if not exists showcase_items (
  id          uuid primary key default gen_random_uuid(),
  showcase_id uuid        not null references showcases(id) on delete cascade,
  -- The owner, denormalised off showcases. It is here so every read can carry
  -- user_id through the join to user_files and let SQL prove the file belongs
  -- to the same account, the way the portfolio read does — a screen never
  -- scopes its own data, and neither should a query have to trust a join.
  user_id     uuid        not null references users(id) on delete cascade,
  -- Same target as portfolio_items.file_key: user_files(key), which is unique
  -- but is not that table's primary key.
  file_key    text        not null references user_files(key) on delete cascade,
  position    integer     not null default 0,
  created_at  timestamptz not null default now(),

  -- The same photograph twice in one showcase is a mistake, not a choice.
  unique (showcase_id, file_key)
);

-- The read: one showcase's pieces, already ordered. position 0 is the cover.
create index if not exists showcase_items_showcase_pos
  on showcase_items (showcase_id, position, created_at);

-- Deleting a file takes its showcase_items row with it (the FK above), and a
-- showcase can end up with none. That is handled on read rather than by a
-- trigger: a showcase with no servable piece is not served, the way a portfolio
-- row whose file lost its thumbnail is filtered out in SQL today.


create table if not exists showcase_credits (
  showcase_id uuid not null references showcases(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  -- "Second shooter", "Retouch", "Styling". Free text: the roles on a shoot are
  -- not a list this app gets to close.
  role        text,
  primary key (showcase_id, user_id)
);

create index if not exists showcase_credits_user
  on showcase_credits (user_id);


-- ── what you keep ────────────────────────────────────────────────────────────

create table if not exists shelves (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references users(id) on delete cascade,
  name       text        not null,
  position   integer     not null default 0,
  -- Public by default: a shelf nobody can see does not show taste, which is the
  -- whole point of it. A private one is a research tool and stays available.
  is_public  boolean     not null default true,
  created_at timestamptz not null default now()
);

create index if not exists shelves_user_pos
  on shelves (user_id, position, created_at);

-- Two shelves of the same name, for one person, is a mistake rather than a
-- choice, and the case-insensitive form is what a person sees as the same name.
create unique index if not exists shelves_user_name
  on shelves (user_id, lower(name));


create table if not exists shelf_items (
  id          uuid        primary key default gen_random_uuid(),
  shelf_id    uuid        not null references shelves(id) on delete cascade,

  -- A POINTER, never a copy. There is deliberately no file_key on this table.
  -- Keeping somebody's work must not re-host it: the author unpublishes or
  -- deletes the showcase and it leaves every shelf at once, rather than
  -- surviving out of their reach in other people's collections.
  showcase_id uuid        not null references showcases(id) on delete cascade,

  -- Who kept it. Denormalised off shelves so "has this viewer kept this?" —
  -- asked once per row on every feed page — is one index lookup and no join.
  user_id     uuid        not null references users(id) on delete cascade,

  -- Why this one. The note is the taste; the save on its own is just a number.
  note        text,
  created_at  timestamptz not null default now(),

  unique (shelf_id, showcase_id)
);

-- A shelf, newest kept first.
create index if not exists shelf_items_shelf
  on shelf_items (shelf_id, created_at desc);

-- "Have I kept this?", per viewer, per showcase.
create index if not exists shelf_items_user_showcase
  on shelf_items (user_id, showcase_id);

-- Who kept a given showcase — the count's source of truth, and the list behind
-- "kept by 61 people".
create index if not exists shelf_items_showcase
  on shelf_items (showcase_id);


-- ── keeping kept_count honest ────────────────────────────────────────────────

-- One person keeping the same showcase on two shelves counts once. Recomputed
-- from shelf_items rather than incremented, because a ±1 that runs twice or not
-- at all drifts silently and there is nothing to notice it: the count is only
-- ever printed, so a wrong one looks exactly like a right one.
--
-- The count is over DISTINCT user_id, which is what "kept by N people" claims.
create or replace function showcase_recount_kept() returns trigger
language plpgsql as $$
declare
  target uuid := coalesce(new.showcase_id, old.showcase_id);
begin
  -- On a cascade from `delete from showcases`, the row this would update is
  -- already gone; the update simply matches nothing, which is correct and is
  -- why there is no guard here.
  update showcases s
     set kept_count = (
           select count(distinct i.user_id)
             from shelf_items i
            where i.showcase_id = target
         )
   where s.id = target;
  return null;
end;
$$;

drop trigger if exists shelf_items_recount on shelf_items;

-- AFTER, and statement-level would not do: the count depends on which showcase
-- each row named, and a statement trigger cannot see them.
create trigger shelf_items_recount
  after insert or delete or update of showcase_id, user_id on shelf_items
  for each row execute function showcase_recount_kept();
