-- Opt-in location sharing, for nearby collaborator discovery.
--
-- Off by default: being findable is a decision the user makes, not a side
-- effect of granting the OS permission once.
alter table users
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists location_updated_at timestamptz,
  add column if not exists shares_location boolean not null default false;

-- Coordinates are stored only to compute distance server-side. They are never
-- returned for anyone but the owner: the discovery endpoint reports a distance
-- and nothing else, so a stranger cannot be located through the API.
create index if not exists users_discoverable_idx
  on users (shares_location)
  where shares_location = true and latitude is not null;

-- A direct-messages table was created here originally. It was replaced by the
-- conversation model in 019 before any message was written, because a
-- sender/recipient pair cannot represent a group chat.
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references users(id) on delete cascade,
  recipient_id uuid not null references users(id) on delete cascade,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
