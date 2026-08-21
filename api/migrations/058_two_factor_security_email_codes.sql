-- Existing databases applied 057 with setup/login as the only challenge
-- purposes. Security-sensitive 2FA changes use their own emailed challenges,
-- so a login code cannot be replayed to disable protection or replace codes.

alter table two_factor_challenges
  drop constraint if exists two_factor_challenges_purpose_check;

alter table two_factor_challenges
  add constraint two_factor_challenges_purpose_check
  check (purpose in ('setup', 'login', 'disable', 'recovery'));
