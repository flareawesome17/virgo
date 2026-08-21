-- Converts the first development implementation (authenticator TOTP) to the
-- email OTP flow. IF clauses keep this safe on fresh databases where migration
-- 056 already has the final email-code schema.

alter table users
  drop column if exists two_factor_secret_enc,
  drop column if exists two_factor_pending_secret_enc,
  drop column if exists two_factor_pending_expires_at,
  drop column if exists two_factor_last_used_step;

alter table two_factor_challenges
  add column if not exists code_hash text,
  add column if not exists purpose text,
  add column if not exists last_sent_at timestamptz;

-- No challenge survives this migration: the old rows contain no email code
-- and are unusable. Deleting them also lets the columns become NOT NULL.
delete from two_factor_challenges
 where code_hash is null or purpose is null or last_sent_at is null;

alter table two_factor_challenges
  alter column code_hash set not null,
  alter column purpose set not null,
  alter column last_sent_at set default now(),
  alter column last_sent_at set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'two_factor_challenges_purpose_check'
  ) then
    alter table two_factor_challenges
      add constraint two_factor_challenges_purpose_check
      check (purpose in ('setup', 'login', 'disable', 'recovery'));
  end if;
end
$$;
