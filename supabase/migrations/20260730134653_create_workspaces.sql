
create table workspaces (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  description text,
  accent_color text not null default '#B66A40',
  media_count integer not null default 0,
  collaborator_count integer not null default 0,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index workspaces_user_id_idx on workspaces(user_id);
alter table workspaces enable row level security;
create policy workspaces_select on workspaces for select using (auth.uid() = user_id);
create policy workspaces_insert on workspaces for insert with check (auth.uid() = user_id);
create policy workspaces_update on workspaces for update using (auth.uid() = user_id);
create policy workspaces_delete on workspaces for delete using (auth.uid() = user_id);
