-- Nearby keeps a device position to about a kilometre.
--
-- The exact fix used to be stored and the distance to it shown to a tenth of a
-- kilometre, which was enough to work out where someone was to about 100 m
-- (DiscoverService, POSITION_DECIMALS). New positions are rounded before they
-- are stored; this rounds the ones already there the same way.
--
-- A city picked by hand is left alone: it is already a city centre, and its
-- coordinates came from the list of places, not from anybody's phone.
set local lock_timeout = '5s';

update users
   set latitude = round(latitude::numeric, 2)::double precision,
       longitude = round(longitude::numeric, 2)::double precision
 where location_place is null
   and latitude is not null
   and longitude is not null
   and (latitude <> round(latitude::numeric, 2)::double precision
        or longitude <> round(longitude::numeric, 2)::double precision);
