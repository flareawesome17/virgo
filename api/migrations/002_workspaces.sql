-- Ported from supabase/migrations/20260730134653_create_workspaces.sql
--   - user_id: dropped `default auth.uid()`, now references our own users table.
--     The API sets it from the authenticated JWT subject.
--   - RLS + 4 policies removed; ownership is enforced in OwnedRepository.
--   - updated_at now maintained by trigger rather than the platform.

create table workspaces (
  id                 text primary key,
  user_id            uuid        not null references users(id) on delete cascade,
  name               text        not null,
  description        text,
  accent_color       text        not null default '#B66A40',
  media_count        integer     not null default 0,
  collaborator_count integer     not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index workspaces_user_id_idx on workspaces(user_id);

create trigger workspaces_set_updated_at
  before update on workspaces
  for each row execute function set_updated_at();
