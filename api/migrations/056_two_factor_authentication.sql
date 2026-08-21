-- Email-code two-factor authentication.
--
-- One-time email codes, recovery codes and login challenge tokens are stored
-- only as keyed/one-way hashes, like refresh tokens.

alter table users
  add column two_factor_enabled_at timestamptz,
  add column two_factor_recovery_codes text[] not null default '{}';

create table two_factor_challenges (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid        not null references users(id) on delete cascade,
  token_hash   text        not null unique,
  code_hash    text        not null,
  purpose      text        not null check (purpose in ('setup', 'login', 'disable', 'recovery')),
  expires_at   timestamptz not null,
  last_sent_at timestamptz not null default now(),
  used_at      timestamptz,
  attempts     integer     not null default 0,
  created_at   timestamptz not null default now()
);

create index two_factor_challenges_user_id_idx
  on two_factor_challenges(user_id);
create index two_factor_challenges_expires_at_idx
  on two_factor_challenges(expires_at);
