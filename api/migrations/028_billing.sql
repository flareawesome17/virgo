-- Paid plans, through PayMongo.
--
-- The user's tier still lives in users.plan, because that is what the quota
-- service reads on every request and it should not have to join to answer
-- "how much storage does this account get". This table is the billing record
-- behind it: what was bought, what PayMongo calls it, and whether it is still
-- being paid for.

-- The tier list the code has used since the rename.
--
-- users.plan was still constrained to ('free', 'pro') — the tiers were renamed
-- to freelance/studio in quota.config.ts and the constraint never followed, so
-- moving anybody onto a paid plan failed the check. Nothing had ever tried
-- until billing existed, which is why it went unnoticed.
--
-- 'pro' stays permitted: accounts already carrying it are aliased to the
-- freelance limits, and dropping it from the constraint would make those rows
-- unwritable.
alter table users drop constraint if exists users_plan_check;
alter table users
  add constraint users_plan_check
  check (plan in ('free', 'freelance', 'studio', 'pro'));

-- PayMongo's customer object, created once per user and reused. Without it,
-- every subscription attempt would make a duplicate customer.
alter table users
  add column if not exists paymongo_customer_id text;

-- When the current tier took effect. Shown on the billing screen, and the
-- thing to look at when somebody asks why they were charged.
alter table users
  add column if not exists plan_since timestamptz;

create table if not exists subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid        not null references users(id) on delete cascade,
  -- PayMongo's id (sub_...). Unique so a replayed webhook updates the row it
  -- already wrote rather than inserting a second one.
  provider_id   text        not null unique,
  -- Which tier this buys. Matches PlanName in quota.config.ts.
  plan_name     text        not null,
  -- PayMongo's own vocabulary, stored verbatim rather than mapped to ours:
  -- when something goes wrong, the value here should be the value in their
  -- dashboard.
  status        text        not null
                  check (status in ('incomplete', 'incomplete_cancelled',
                                    'active', 'past_due', 'unpaid', 'cancelled')),
  -- Minor units — centavos. PayMongo settles PHP only.
  amount_minor  integer     not null,
  currency      text        not null default 'PHP',
  -- When the paid-for period runs out. Null while incomplete.
  current_period_end timestamptz,
  cancelled_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- How this was bought.
--
-- 'subscription' is a real auto-renewing PayMongo subscription. 'one_time' is
-- a single month bought through a Checkout Session, used when the account does
-- not have subscriptions enabled — the two are cancelled and renewed by
-- different endpoints, and guessing from the id prefix would be a rule nobody
-- reading this table could see.
alter table subscriptions
  add column if not exists kind text not null default 'subscription';

do $$
begin
  alter table subscriptions
    add constraint subscriptions_kind_check
    check (kind in ('subscription', 'one_time'));
exception
  when duplicate_object then null;
end $$;

create index if not exists subscriptions_user_idx on subscriptions (user_id);

-- "Is this account paying?" is asked far more often than "what did they buy
-- in 2024", and only one subscription per user is live at a time.
create index if not exists subscriptions_user_live_idx
  on subscriptions (user_id)
  where status in ('active', 'past_due');

-- Every webhook PayMongo has delivered.
--
-- Providers retry until they get a 2xx, and a retry of "invoice paid" must not
-- extend the period a second time. The primary key is the provider's event id,
-- so a replay collides and is skipped.
create table if not exists billing_events (
  id           text        primary key,
  type         text        not null,
  -- Kept for support: when a charge is disputed, the raw event is the record.
  payload      jsonb       not null,
  received_at  timestamptz not null default now()
);

create index if not exists billing_events_received_idx
  on billing_events (received_at desc);
