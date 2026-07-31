-- Ported from supabase/migrations/20260730134659_create_schedule_events.sql
-- No updated_at column in the original, so no trigger here.

create table schedule_events (
  id           text primary key,
  user_id      uuid        not null references users(id) on delete cascade,
  workspace_id text        references workspaces(id) on delete set null,
  title        text        not null,
  description  text,
  event_date   date        not null,
  event_time   time,
  event_type   text        not null default 'shoot'
                 check (event_type in ('shoot', 'editing', 'review', 'delivery', 'meeting')),
  created_at   timestamptz not null default now()
);

create index schedule_events_user_id_idx on schedule_events(user_id);
create index schedule_events_workspace_id_idx on schedule_events(workspace_id);
create index schedule_events_event_date_idx on schedule_events(event_date);
