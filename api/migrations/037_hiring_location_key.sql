-- A comparable, indexable form of a job post's location.
--
-- `location` is free text and the board filtered it with
-- `location ilike '%' || $1 || '%'`. That is case-insensitive but nothing
-- else: "Ozamis" never matched "Ozamiz", "Paranaque" never matched
-- "Parañaque", and a leading wildcard cannot use an index, so every search was
-- a sequential scan over the whole board.
--
-- `location_key` holds the folded form — lowercase, unaccented, punctuation and
-- spacing removed — written by the API on create. Searching a prefix of it is
-- both accent-blind and able to use the index below.
--
-- The display value stays exactly as `location`, because "Cagayan de Oro" is
-- what a person should read and `cagayandeoro` is only what the database
-- compares.

alter table hiring_posts
  add column if not exists location_key text;

-- Backfill with the same folding the API applies.
--
-- `translate` rather than the unaccent extension: unaccent is not installed,
-- and stripping the accents by hand is both dependency-free and deterministic.
-- It has to happen *before* the [^a-z0-9] filter, or "Parañaque" folds to
-- "paraaque" here and "paranaque" in JavaScript — the same place with two
-- keys, which is precisely the bug this column exists to prevent.
update hiring_posts
   set location_key = regexp_replace(
         lower(translate(location,
                         'ÁÀÂÄÃÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÑÇáàâäãéèêëíìîïóòôöõúùûüñç',
                         'AAAAAEEEEIIIIOOOOOUUUUNCaaaaaeeeeiiiiooooouuuunc')),
         '[^a-z0-9]+', '', 'g')

 where location is not null
   and location_key is null;

-- Prefix searches are the ones people actually type — "cebu" for "Cebu City" —
-- and text_pattern_ops is what lets a LIKE 'prefix%' use the index at all.
create index if not exists hiring_posts_location_key_idx
  on hiring_posts (location_key text_pattern_ops)
  where status = 'open';
