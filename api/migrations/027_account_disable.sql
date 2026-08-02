-- Temporarily disabling an account.
--
-- A date rather than a boolean: "disabled" with no end is indistinguishable
-- from banned, and the point of this is that it lifts by itself. The account
-- comes back when the clock passes disabled_until, with no job to run and
-- nothing to remember to switch off.
alter table users
  add column if not exists disabled_until timestamptz;

-- Set when the user disables, kept when it lifts. Without it the app cannot
-- tell "you disabled this yourself last week" from "you have never disabled
-- it", which is the difference between a helpful notice and a confusing one.
alter table users
  add column if not exists disabled_at timestamptz;

-- Login and refresh both read this on every request; a partial index keeps it
-- to the handful of rows that are actually disabled.
create index if not exists users_disabled_until_idx
  on users (disabled_until)
  where disabled_until is not null;

-- A disabled account should not be found in search or appear in Nearby. Both
-- are enforced in the queries rather than here, because the flag has to lift
-- on its own — a trigger flipping `discoverable` could not put it back.
