-- Changing the email address on an account.
--
-- A change is a link sent to the new address, like verification, so it rides
-- on auth_tokens: one more purpose, and the address the link confirms. The
-- address lives on the token rather than on users so a second request simply
-- supersedes the first (issue() retires the old link), and nothing on the
-- account itself changes until the new inbox has answered.
--
-- Additive only: a wider check and a nullable column. The release before this
-- never writes the new purpose and never reads the column, so a rollback
-- reverses nothing.
set local lock_timeout = '5s';

alter table auth_tokens drop constraint if exists auth_tokens_purpose_check;
alter table auth_tokens
  add constraint auth_tokens_purpose_check
  check (purpose in ('verify_email', 'reset_password', 'change_email'));

alter table auth_tokens add column if not exists new_email text;

-- Only a change carries an address, and a change always does.
alter table auth_tokens drop constraint if exists auth_tokens_new_email_check;
alter table auth_tokens
  add constraint auth_tokens_new_email_check
  check ((purpose = 'change_email') = (new_email is not null));
