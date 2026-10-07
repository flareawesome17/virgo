-- Nearby from the address: everyone with a city appears, unless they hide.
--
-- Until now Nearby held only the people who had flipped "Share my location",
-- which almost nobody had, so the screen was empty for almost everybody and
-- a hiring tool with nobody in it. Every account since 050 already says which
-- city it is in. That city — never the street — is now enough to be found,
-- and to look.

/*
 * Where the address's city is, worked out by the API from its own tables
 * (discover/places.ts) when the address is written. Stored rather than
 * worked out per search, because the search measures every account in SQL
 * and the tables live in the API.
 *
 * A city centre or a province's capital: a public place thousands of people
 * share, so these are no more private than the city name beside them.
 *
 * address_geocoded_at is set even when the city could not be placed. It is
 * what tells the backfill a row has been looked at, and without it every
 * boot would retry the same unknown towns forever.
 */
alter table users
  add column if not exists address_latitude    double precision,
  add column if not exists address_longitude   double precision,
  add column if not exists address_place       text,
  add column if not exists address_geocoded_at timestamptz,
  /*
   * Opting out, rather than in. Being shown is the default because a city
   * is what a profile already says; hiding is one switch in Privacy, and
   * it hides you whatever placed you — the address, a city you picked, or
   * your device. You can still look around while hidden.
   */
  add column if not exists nearby_hidden boolean not null default false;

comment on column users.address_place is
  'Where Nearby places this account from its address: a city from the job board''s table or a province. Never the street. Null when the address could not be placed.';
comment on column users.nearby_hidden is
  'Left out of everyone''s Nearby. Searching is unaffected.';

-- The rows the backfill still has to look at. Partial, so it costs nothing
-- once every existing address has been seen.
create index if not exists users_address_ungeocoded_idx
  on users (id)
  where address_city is not null and address_geocoded_at is null;
