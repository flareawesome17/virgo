-- A role in the person's own words, and Sign in with Apple.
--
-- custom_roles
--   The roles list is closed on purpose (see auth/roles.ts): it is what Nearby
--   and the job board match on, and free text there turns a match into a
--   search for every spelling of "videographer". But the list cannot name
--   everything somebody does on a shoot, and the only answer was to pick the
--   nearest wrong thing. These are shown on a profile and matched on nothing.
--   A few, not a paragraph: the check keeps a client from storing a list.
--
-- apple_sub
--   Apple's identifier for the person, stable for this app. Null on every
--   account that has never signed in with Apple. Unique among those that have:
--   one Apple ID opens one account.

alter table users
  add column if not exists custom_roles text[] not null default '{}';

alter table users
  drop constraint if exists users_custom_roles_few;
alter table users
  add constraint users_custom_roles_few check (cardinality(custom_roles) <= 3);

alter table users
  add column if not exists apple_sub text;

create unique index if not exists users_apple_sub_key
  on users (apple_sub)
  where apple_sub is not null;
