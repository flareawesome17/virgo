-- Foundation: users (replaces Supabase's auth.users), refresh tokens, and the
-- updated_at trigger that Supabase's platform used to provide implicitly.

-- gen_random_uuid() is built into Postgres 13+; no extension required.

create table users (
  id            uuid primary key default gen_random_uuid(),
  -- Stored lowercase. AuthService normalizes before every read and write, so a
  -- plain unique constraint gives case-insensitive uniqueness without citext.
  email         text        not null unique,
  password_hash text        not null,
  display_name  text,
  avatar_url    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Refresh tokens are stored hashed: a database leak must not yield usable
-- tokens. Rotation inserts a new row and revokes the old one.
create table refresh_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid        not null references users(id) on delete cascade,
  token_hash text        not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index refresh_tokens_user_id_idx on refresh_tokens(user_id);
create index refresh_tokens_expires_at_idx on refresh_tokens(expires_at);

-- Supabase maintained updated_at for us. On vanilla Postgres it would keep its
-- insert value forever without this trigger.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger users_set_updated_at
  before update on users
  for each row execute function set_updated_at();
