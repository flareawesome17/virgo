-- Where the shoot actually is.
--
-- The calendar could say what an event was and when, but never where. People
-- worked around it by typing the venue into the description — the mobile form
-- still suggests exactly that in its placeholder — which means the one fact you
-- need on the morning of a job was buried in free text alongside everything
-- else.
--
-- It also blocks the question this exists to answer: "who is available near my
-- shoot". Nearby can already measure from any city; it just had no way to learn
-- which city a job is in.
--
-- One column, not four. hiring_posts stores location_key and coordinates
-- because the board sorts *many* posts by distance, and 044 makes that case
-- plainly: resolving in application code is "fine once per post and wrong once
-- per row of every board query". This is the other shape — one event's location
-- becomes the centre of a search over users, resolved once per request through
-- coordsFor(). Adding a key and coordinates here would be storing derived data
-- to save a lookup nobody repeats.
--
-- Free text, like hiring_posts.location and users.location. Shoots happen at
-- resorts, churches and barangays as often as in a city, and a picker that
-- refused "Shangri-La Mactan" would make the common case harder than the plain
-- box. A venue we cannot place is stored as written; it simply cannot be
-- searched from.
--
-- Nullable, and null is the ordinary state: every event that already exists has
-- no location, and none of them is broken for it.
alter table schedule_events
  add column if not exists location text;

comment on column schedule_events.location is
  'Where the event happens, as typed. Canonicalised to a known city name when we recognise one, kept verbatim otherwise. Null for events with no location.';
