-- Where somebody actually is, when they choose to say.
--
-- Separate from `location`, which is the city on a public profile and is shown
-- to other people, and from latitude/longitude, which exist only while
-- location sharing is on and are never shown as a place. This is a postal
-- address: it is not public, it is not shown to anybody else, and nothing in
-- the product reads it today.
--
-- Asked for at signup, and required there.
--
-- The columns stay nullable all the same: the accounts that existed before
-- this migration have no address and are not broken, and a NOT NULL here
-- would either reject them or need a fake value invented for them. The
-- requirement belongs at the point of collection, where it can be explained,
-- not as a constraint that makes older rows illegal.
alter table users
  add column if not exists address_line1  text,
  add column if not exists address_line2  text,
  add column if not exists address_city    text,
  add column if not exists address_province text,
  add column if not exists address_postal  text,
  -- Two letters, ISO 3166-1. Defaulted nowhere: the market is the Philippines
  -- but the form should not decide that for somebody living elsewhere.
  add column if not exists address_country text,
  -- What they trade as, when that is not their own name. Optional: plenty of
  -- people freelance under the name on their passport, and an empty studio
  -- field should not read as an incomplete profile.
  add column if not exists studio_name    text,
  -- How to find them online. One field, not one per network: people give an
  -- Instagram handle, a Facebook page or a full URL depending on where they
  -- actually work, and three empty boxes would be three ways to look
  -- incomplete. Stored as typed.
  add column if not exists social_handle  text;

comment on column users.address_line1 is
  'Postal address. Private, never shown to other users. Required for accounts created since 050; null on ones made before it.';
