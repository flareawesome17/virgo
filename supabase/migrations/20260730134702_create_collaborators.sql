
create table collaborators (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  workspace_id text not null references workspaces(id) on delete cascade,
  name text not null,
  avatar_url text,
  role text not null default 'editor' check (role in ('owner', 'photographer', 'editor', 'reviewer', 'client')),
  created_at timestamptz not null default now()
);
create index collaborators_user_id_idx on collaborators(user_id);
create index collaborators_workspace_id_idx on collaborators(workspace_id);
alter table collaborators enable row level security;
create policy collaborators_select on collaborators for select using (auth.uid() = user_id);
create policy collaborators_insert on collaborators for insert with check (auth.uid() = user_id);
create policy collaborators_update on collaborators for update using (auth.uid() = user_id);
create policy collaborators_delete on collaborators for delete using (auth.uid() = user_id);
