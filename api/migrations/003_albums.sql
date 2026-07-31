-- Ported from supabase/migrations/20260730134657_create_albums.sql
-- Folds in 20260730140437_add_retention_to_albums.sql (retention_days), since
-- this is a greenfield rebuild rather than an incremental change.

create table albums (
  id             text primary key,
  user_id        uuid        not null references users(id) on delete cascade,
  workspace_id   text        not null references workspaces(id) on delete cascade,
  name           text        not null,
  description    text,
  cover_url      text,
  item_count     integer     not null default 0,
  status         text        not null default 'draft'
                   check (status in ('draft', 'review', 'delivered')),
  retention_days integer,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index albums_user_id_idx on albums(user_id);
create index albums_workspace_id_idx on albums(workspace_id);

create trigger albums_set_updated_at
  before update on albums
  for each row execute function set_updated_at();
