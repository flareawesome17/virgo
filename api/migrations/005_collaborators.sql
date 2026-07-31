-- Ported from supabase/migrations/20260730134702_create_collaborators.sql

create table collaborators (
  id           text primary key,
  user_id      uuid        not null references users(id) on delete cascade,
  workspace_id text        not null references workspaces(id) on delete cascade,
  name         text        not null,
  avatar_url   text,
  role         text        not null default 'editor'
                 check (role in ('owner', 'photographer', 'editor', 'reviewer', 'client')),
  created_at   timestamptz not null default now()
);

create index collaborators_user_id_idx on collaborators(user_id);
create index collaborators_workspace_id_idx on collaborators(workspace_id);
