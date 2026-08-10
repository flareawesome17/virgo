-- Password resets for console accounts.
--
-- The console has no sign-up and, until now, no way back in: an owner who
-- forgot their password needed someone with a shell on the container. That is
-- fine for one person on one laptop and stops being fine the moment there is
-- a second admin.
--
-- The token is never stored, only its digest — a leaked backup of this table
-- must not hand over the ability to take over an account. Thirty minutes,
-- single use, and every existing session is ended when one is redeemed.
create table if not exists admin_password_resets (
  id         uuid primary key default gen_random_uuid(),
  admin_id   uuid not null references admin_users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at    timestamptz,
  -- Kept so a burst of requests is visible in the table itself, without
  -- needing the rate limiter's memory to answer "was this account targeted".
  requested_ip text,
  created_at timestamptz not null default now()
);

create index if not exists admin_password_resets_admin_idx
  on admin_password_resets (admin_id, created_at desc);
