-- Forces a password change on an account nobody chose the password for.
--
-- The seeded owner is created with a random password the server generated and
-- printed to its own logs. That is the least bad way to bootstrap a console
-- with no sign-up, but it means the first credential has been written down
-- somewhere by definition — so it must not survive first use.
--
-- Defaults false: every account created by a human through the console has a
-- password that human chose, and forcing a change on those would be noise.
alter table admin_users
  add column if not exists must_change_password boolean not null default false;
