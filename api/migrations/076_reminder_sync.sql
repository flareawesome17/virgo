-- One reminder, one notification per phone.
--
-- A reminder was delivered twice on the phone that made it: once by the local
-- alarm the app schedules (exact, and it works offline) and again by the
-- server's push. The server could not tell a phone that already had the alarm
-- from one that did not — a phone that has not been opened since a reminder
-- was made on the web, say — so it pushed to every one.
--
-- Now a phone reports when it last scheduled its reminders, and how far ahead
-- that covers (iOS keeps at most 64 pending). The dispatcher skips a phone's
-- push for a reminder that phone scheduled: one changed before that report,
-- due after it, and inside what it covers. Everything else still gets the push.
--
-- Additive only. The release before this never writes the columns, and a
-- token with no report is pushed to exactly as before.
set local lock_timeout = '5s';

alter table reminders
  add column if not exists updated_at timestamptz not null default now();

-- Only for what a person edits. The sweep's own claim (`set notified_at`)
-- must not count as a change: it would make every phone look out of date for
-- the very reminder being sent, and nothing would ever be skipped.
drop trigger if exists reminders_set_updated_at on reminders;
create trigger reminders_set_updated_at
  before update of schedule_event_id, title, description, reminder_time,
                   is_alarm_enabled, has_push_notification, is_completed
  on reminders
  for each row execute function set_updated_at();

alter table push_tokens
  add column if not exists reminders_synced_at timestamptz,
  -- Null means everything the phone was given; set when it had to stop short.
  add column if not exists reminders_covered_until timestamptz;
