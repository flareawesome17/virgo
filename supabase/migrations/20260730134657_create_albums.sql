
create table albums (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  workspace_id text not null references workspaces(id) on delete cascade,
  name text not null,
  description text,
  cover_url text,
  item_count integer not null default 0,
  status text not null default 'draft' check (status in ('draft', 'review', 'delivered')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index albums_user_id_idx on albums(user_id);
create index albums_workspace_id_idx on albums(workspace_id);
alter table albums enable row level security;
create policy albums_select on albums for select using (auth.uid() = user_id);
create policy albums_insert on albums for insert with check (auth.uid() = user_id);
create policy albums_update on albums for update using (auth.uid() = user_id);
create policy albums_delete on albums for delete using (auth.uid() = user_id);
