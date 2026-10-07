-- Money: what the year looks like, and what repeats.
--
-- Two things change. An expense can now be a cost toward a package — the
-- second shooter, the venue — so a package says what the job really earned
-- (package_id already exists on money_entries; nothing to add for that). And
-- an entry can repeat monthly: the software subscription, the studio rent.
-- A repeating entry is a template the API turns into an ordinary entry when
-- its day comes, once.
--
-- Additive only. Deploys roll the image back without reversing migrations.
set local lock_timeout = '5s';

create table if not exists money_recurring (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users (id) on delete cascade,
  kind          text not null check (kind in ('income', 'expense')),
  amount_minor  integer not null check (amount_minor > 0 and amount_minor <= 1000000000),
  -- What the client withholds each time, on income: a corporate retainer's EWT.
  withheld_minor integer not null default 0 check (withheld_minor >= 0),
  category      text not null check (char_length(category) between 1 and 32),
  method        text check (method in ('gcash', 'maya', 'bank', 'cash', 'card', 'other')),
  counterparty  text check (char_length(counterparty) <= 120),
  note          text check (char_length(note) <= 1000),
  -- 1 to 28, so every month has the day.
  day_of_month  smallint not null check (day_of_month between 1 and 28),
  -- The next day an entry is due to be made.
  next_on       date not null,
  stopped_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (withheld_minor <= amount_minor and (kind = 'income' or withheld_minor = 0))
);

create index if not exists money_recurring_due_idx
  on money_recurring (next_on)
  where stopped_at is null;
create index if not exists money_recurring_user_idx
  on money_recurring (user_id, created_at desc);

drop trigger if exists money_recurring_set_updated_at on money_recurring;
create trigger money_recurring_set_updated_at
  before update on money_recurring
  for each row execute function set_updated_at();

-- The template an entry was made from. SET NULL: stopping or deleting the
-- template leaves the entries it made, which are money that moved.
alter table money_entries
  add column if not exists recurring_id uuid references money_recurring (id) on delete set null;

-- One entry per template per day, whatever retries or overlapping runs do.
create unique index if not exists money_entries_recurring_day_key
  on money_entries (recurring_id, occurred_on)
  where recurring_id is not null;

/* Which months each person has been sent their recap for: once each. */
create table if not exists money_recaps (
  user_id  uuid not null references users (id) on delete cascade,
  month    text not null check (month ~ '^\d{4}-\d{2}$'),
  sent_at  timestamptz not null default now(),
  primary key (user_id, month)
);
