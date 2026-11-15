-- Money: savings.
--
-- A saving is something a person is putting money aside for — a lens, the
-- tax bill, three slow months — with what they want to reach and by when, if
-- they said. As many as they like.
--
-- Virgo holds none of it. These are the person's own notes of what they have
-- put aside, wherever they keep it; "kept_in" is a word of theirs ("GCash"),
-- not an account anything is connected to.
--
-- What a saving holds is worked out from its moves, never stored, so it can't
-- drift from them: a move is money put in (positive) or taken out (negative).
-- Setting money aside is not an expense, and a move is not a ledger entry:
-- money_entries is what was earned and spent, and is what the tax estimate
-- reads.
--
-- Additive only. Deploys roll the image back without reversing migrations.
set local lock_timeout = '5s';

create table if not exists money_savings (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 80),
  -- Which picture the clients draw for it. A word, not an image.
  icon         text not null default 'other' check (char_length(icon) <= 24),
  -- What they want to reach, in centavos; null is a running total.
  goal_minor   bigint check (goal_minor is null or (goal_minor > 0 and goal_minor <= 100000000000)),
  target_date  date,
  kept_in      text check (char_length(kept_in) <= 60),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists money_savings_user_idx
  on money_savings (user_id, created_at);

drop trigger if exists money_savings_set_updated_at on money_savings;
create trigger money_savings_set_updated_at
  before update on money_savings
  for each row execute function set_updated_at();

create table if not exists money_saving_moves (
  id            uuid primary key default gen_random_uuid(),
  saving_id     uuid not null references money_savings (id) on delete cascade,
  -- Carried here as well, so one person's moves are read without a join and
  -- go with the account.
  user_id       uuid not null references users (id) on delete cascade,
  -- In centavos: positive is put in, negative is taken out. Never nothing.
  amount_minor  bigint not null check (amount_minor <> 0 and abs(amount_minor) <= 100000000000),
  note          text check (char_length(note) <= 200),
  -- The day it was moved, in the person's own calendar.
  moved_on      date not null,
  created_at    timestamptz not null default now()
);

create index if not exists money_saving_moves_saving_idx
  on money_saving_moves (saving_id, moved_on desc, created_at desc);

create index if not exists money_saving_moves_user_day_idx
  on money_saving_moves (user_id, moved_on);
