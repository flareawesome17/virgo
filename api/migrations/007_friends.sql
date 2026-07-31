-- Ported from supabase/migrations/20260730154427_create_friends.sql

create table friends (
  id                text primary key,
  user_id           uuid        not null references users(id) on delete cascade,
  friend_name       text        not null,
  friend_email      text,
  friend_avatar_url text,
  status            text        not null default 'pending'
                      check (status in ('pending', 'accepted', 'declined')),
  requested_by      text        not null
                      check (requested_by in ('me', 'them')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index friends_user_id_idx on friends(user_id);
create index friends_status_idx on friends(status);

create trigger friends_set_updated_at
  before update on friends
  for each row execute function set_updated_at();
