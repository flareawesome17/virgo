-- Makes "this ends every session" true for access tokens too.
--
-- Revoking refresh tokens was not enough. An access token is a stateless JWT
-- with a 30 minute life, so after a password change the previous holder kept
-- working access for the rest of that window — which is exactly the window
-- that matters when the reason for the change is that somebody else saw the
-- password.
--
-- `verify()` now refuses any token issued (`iat`) before this instant. Set on
-- password change and whenever an account is disabled.
alter table admin_users
  add column if not exists sessions_valid_from timestamptz;
