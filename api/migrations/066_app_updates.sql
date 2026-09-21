-- Update announcements: one row per update, shown to whoever it concerns.
--
-- Not rows in `notifications`. That table is one row per person, written when
-- something happens *to* that person. An update happens to a build, and the
-- same account can be on three of them at once — the web app, a Mac and a
-- phone — each of which needs to hear about a different set of changes. So an
-- announcement is written once, targeted at platforms and versions, and each
-- client asks for the ones that apply to what it is.
--
-- The targeting is the point. A release rebuilds the web app and every
-- desktop installer whether or not it changed them, so "an update shipped" is
-- not the same as "this device changed", and only whoever ships it can say
-- which platforms it actually touched.
create table if not exists app_updates (
  id           uuid        primary key default gen_random_uuid(),
  -- Chosen by whoever announces it, so posting the same announcement twice —
  -- a re-run workflow, a retried request — is one announcement and one push,
  -- not two.
  slug         text        not null unique,
  -- Which clients see it. `windows` and `macos` are the desktop app.
  platforms    text[]      not null
    check (
      cardinality(platforms) > 0
      and platforms <@ array['web', 'windows', 'macos', 'ios', 'android']::text[]
    ),
  -- Inclusive bounds on the client's own version, either optional. An OTA
  -- reaches exactly one native version, so it sets both to that version; a new
  -- build is news only to the versions below it, so it sets a ceiling.
  -- Stored as text and compared numerically in the API: `1.10.0` is newer
  -- than `1.9.0`, which neither text nor a naive cast gets right.
  min_version  text,
  max_version  text,
  -- The version this update brings, for display.
  version      text,
  title        text        not null,
  body         text        not null,
  -- Release notes, a download page, anything worth opening from the list.
  url          text,
  published_at timestamptz not null default now()
);

-- The list reads newest first, within the retention window.
create index if not exists app_updates_published_idx
  on app_updates (published_at desc);

-- Who has read which announcement. Absence means unread.
--
-- Per announcement rather than a "read up to" timestamp, because a person's
-- web session marking everything read must not mark the phone's announcements
-- read too — the phone's were never shown on the web.
create table if not exists app_update_reads (
  user_id   uuid        not null references users(id) on delete cascade,
  update_id uuid        not null references app_updates(id) on delete cascade,
  read_at   timestamptz not null default now(),
  primary key (user_id, update_id)
);

-- The app version each device reports, so a push about an OTA reaches only
-- the phones that update will actually arrive on. Null for devices registered
-- before this existed; those receive only announcements with no version
-- bounds, since there is nothing to match a bound against.
alter table push_tokens
  add column if not exists app_version text;
