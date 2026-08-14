-- Being findable should not require granting a location permission.
--
-- Nearby has only ever worked from device GPS. That excludes anyone who
-- declines the OS prompt, and it excludes the desktop web app, where the
-- browser prompt is both more intrusive and less useful. The city is the
-- resolution this feature actually works at — every distance it shows is in
-- kilometres — so naming one is enough.
--
-- Numbered 054 rather than 053 to sit after the schedule event vocabulary
-- change, which is in flight on its own branch. The two are independent and
-- the migrator applies by filename, so the order between them does not matter;
-- two files claiming the same number would only be confusing to read.
--
-- One column rather than a `location_source` enum plus a label: a name here
-- *is* "this was chosen by hand", and the two could not then disagree.
--
-- Null for a GPS position, which is every existing row. Deliberately separate
-- from users.location, the free-text city on a public profile: that one is
-- typed freehand, is never matched against anything, and today holds values
-- like 'Plaridel Misamis Occidental' that resolve to no coordinates at all.
alter table users
  add column if not exists location_place text;

comment on column users.location_place is
  'The city this account''s coordinates were derived from, when it picked one instead of using GPS. Null means the position came from the device.';
