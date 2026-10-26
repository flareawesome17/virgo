-- Nearby names the town, and knows how closely it can say where that is.
--
-- 089 placed an address at a city from the job board's table, about seventy
-- cities, and at the province's capital for every other town. Nearby showed
-- the province ("In Misamis Occidental") and the distance to its capital, so
-- everyone in a province's other towns stood on one point at one distance:
-- seven people in Misamis Occidental, all "about 1 km" from a viewer near
-- Oroquieta.
--
-- The API now knows every city and municipality in the country
-- (discover/ph-towns.ts, from Wikidata), so an address stands at its own
-- town's centre.
--
--   address_place      The town and its province: "Plaridel, Misamis
--                      Occidental". The province alone when the town box
--                      names no town the API knows.
--   address_precision  'city' when the coordinates are the town's own centre,
--                      'province' when they are the capital standing in for
--                      a town box that could not be matched. The API states
--                      a distance no more finely than the position allows
--                      (discover/distance.ts).
--
-- The labels and the precision come from the API's tables, so every address
-- is placed again by its backfill at boot: address_geocoded_at is cleared
-- below, which is what the backfill looks for.
--
-- Additive. An older image ignores the column and shows the new labels as
-- they are. Anything it places in the meantime has no precision, and the
-- backfill places it again on the way forward.
set local lock_timeout = '5s';

alter table users
  add column if not exists address_precision text
    constraint users_address_precision_check
    check (address_precision in ('city', 'province'));

comment on column users.address_place is
  'What Nearby shows for this account from its address: "Town, Province", or the province alone. Never the street. Null when the address could not be placed.';
comment on column users.address_precision is
  'How closely address_latitude/longitude place this account: city (the town''s centre) or province (the province''s capital standing in for a town box the API could not match).';

update users
   set address_geocoded_at = null
 where address_city is not null
   and address_geocoded_at is not null;
