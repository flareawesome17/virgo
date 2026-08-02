-- Whether an account can be found by name in people search.
--
-- On by default: an app whose point is inviting collaborators is useless if
-- nobody can be found. What this adds is a way out for someone who does not
-- want to surface to strangers typing a common name.
--
-- Exact-email lookup deliberately stays open. It is how you add a specific
-- person you already know, it reveals nothing to someone who does not already
-- have the address, and closing it would break invitations entirely.
alter table users
  add column if not exists discoverable boolean not null default true;
