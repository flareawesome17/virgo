create table friends (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  friend_name text not null,
  friend_email text,
  friend_avatar_url text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  requested_by text not null check (requested_by in ('me', 'them')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index friends_user_id_idx on friends(user_id);
create index friends_status_idx on friends(status);
alter table friends enable row level security;
create policy friends_select on friends for select using (auth.uid() = user_id);
create policy friends_insert on friends for insert with check (auth.uid() = user_id);
create policy friends_update on friends for update using (auth.uid() = user_id);
create policy friends_delete on friends for delete using (auth.uid() = user_id);
