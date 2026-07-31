-- Server-side push delivery for reminders.
--
-- Until now `has_push_notification` was a column nothing read: no token was
-- ever stored and no job ever ran, so a reminder with push enabled did nothing
-- at its due time.

create table if not exists push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  -- Expo push token, e.g. ExponentPushToken[xxxxxxxx]. Unique across the table:
  -- reinstalling reassigns the same device token, and it must follow the
  -- account that registered it last rather than notifying the previous owner.
  token text not null unique,
  platform text not null check (platform in ('ios', 'android', 'web')),
  -- Cleared when Expo reports the token as dead so we stop sending to it.
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_tokens_user_id_idx on push_tokens (user_id);

drop trigger if exists set_push_tokens_updated_at on push_tokens;
create trigger set_push_tokens_updated_at
  before update on push_tokens
  for each row execute function set_updated_at();

-- Marks a reminder as already pushed. Without it the every-minute sweep would
-- resend the same reminder on each pass.
alter table reminders
  add column if not exists notified_at timestamptz;

-- The dispatcher's query: due, unsent, not completed. Partial so the index
-- stays small — rows are only interesting until they have been sent.
create index if not exists reminders_pending_push_idx
  on reminders (reminder_time)
  where notified_at is null and is_completed = false;
