-- Profile pages: a cover photo, an "Available for bookings" badge, and a
-- switch that decides whether the studio name is shown on the public profile.
--
-- Additive only. The Windows deploy runs migrations before it starts the new
-- image, and rolls the image back without reversing them when the health gate
-- fails (docs/PRODUCTION_DEPLOYMENT.md). The release before this one never
-- reads these three columns. Its `select *` / `returning *` on users carries
-- them along, but toPublicUser and PublicProfile are explicit mappings, so
-- nothing new reaches a client through it.
--
-- Both booleans have constant defaults. Postgres records those in the catalogue
-- (attmissingval) instead of rewriting the table, so the ACCESS EXCLUSIVE lock
-- below is held for a moment, not for a table rewrite.
--
-- There is deliberately no cover_focus_y. The phone crops the photo to the
-- cover's 2:1 shape, at the position the person dragged it to, before it
-- uploads. The stored image is already framed, so there is nothing left to
-- position and no second number for every surface to agree on.

-- The same bounded wait as 069. The previous image keeps serving while this
-- runs, and a busy moment should fail the deploy cleanly, not queue requests
-- behind a lock request that is itself queueing. SET LOCAL holds for this
-- file's transaction only; the migrator runs each file in one.
set local lock_timeout = '5s';

alter table users
  -- A permanent CDN URL in the public bucket, like avatar_url. Written only by
  -- PATCH/DELETE /me/profile/cover, which builds it from an object key under
  -- users/<id>/covers/ that the confirm step re-encoded to WebP. Never a URL a
  -- client supplied.
  add column if not exists cover_url text,
  -- A badge on the profile. It does not gate Hire.
  add column if not exists available_for_bookings boolean not null default false,
  -- Whether studio_name appears on the public profile. Off, it stays as private
  -- as the rest of the account.
  add column if not exists show_studio boolean not null default false;

comment on column users.cover_url is
  'Public CDN URL of the profile cover (users/<id>/covers/..., WebP, at most 2048 px wide at 2:1). Set only via /me/profile/cover.';
comment on column users.available_for_bookings is
  'Shows an "Available for bookings" badge on the profile. Display only; does not gate hiring.';
comment on column users.show_studio is
  'When true and studio_name is not blank, studio_name is part of the public profile.';
