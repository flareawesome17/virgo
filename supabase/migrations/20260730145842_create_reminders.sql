create table reminders (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  schedule_event_id text references schedule_events(id) on delete set null,
  title text not null,
  description text,
  reminder_time timestamptz not null,
  is_alarm_enabled boolean not null default true,
  has_push_notification boolean not null default true,
  is_completed boolean not null default false,
  created_at timestamptz not null default now()
);
create index reminders_user_id_idx on reminders(user_id);
create index reminders_schedule_event_id_idx on reminders(schedule_event_id);
create index reminders_reminder_time_idx on reminders(reminder_time);
alter table reminders enable row level security;
create policy reminders_select on reminders for select using (auth.uid() = user_id);
create policy reminders_insert on reminders for insert with check (auth.uid() = user_id);
create policy reminders_update on reminders for update using (auth.uid() = user_id);
create policy reminders_delete on reminders for delete using (auth.uid() = user_id);
