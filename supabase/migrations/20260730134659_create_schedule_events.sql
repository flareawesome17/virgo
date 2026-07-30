
create table schedule_events (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  workspace_id text references workspaces(id) on delete set null,
  title text not null,
  description text,
  event_date date not null,
  event_time time,
  event_type text not null default 'shoot' check (event_type in ('shoot', 'editing', 'review', 'delivery', 'meeting')),
  created_at timestamptz not null default now()
);
create index schedule_events_user_id_idx on schedule_events(user_id);
create index schedule_events_workspace_id_idx on schedule_events(workspace_id);
create index schedule_events_event_date_idx on schedule_events(event_date);
alter table schedule_events enable row level security;
create policy schedule_events_select on schedule_events for select using (auth.uid() = user_id);
create policy schedule_events_insert on schedule_events for insert with check (auth.uid() = user_id);
create policy schedule_events_update on schedule_events for update using (auth.uid() = user_id);
create policy schedule_events_delete on schedule_events for delete using (auth.uid() = user_id);
