-- Where a job actually is, so the board can put the nearest ones first.
--
-- Resolved from the post's location text against the city table in
-- `api/src/hiring/locations.ts` at write time, rather than joined at read
-- time: the lookup is a linear scan over 71 entries in application code, which
-- is fine once per post and wrong once per row of every board query.
--
-- Nullable, and that is a normal state. A shoot at "Shangri-La Mactan" is a
-- real location with no coordinate here; those posts still appear, they just
-- sort after the ones that can be measured.
alter table hiring_posts
  add column if not exists location_lat double precision,
  add column if not exists location_lon double precision;

-- Only rows that can take part in distance ordering.
create index if not exists hiring_posts_coords_idx
  on hiring_posts (location_lat, location_lon)
  where status = 'open' and location_lat is not null;
