-- Client downloads counted as deliveries, not fetches.
--
-- The allowance counted every byte sent, so one wedding gallery downloaded
-- by the couple, a parent and a phone that dropped part way used 40 GB of a
-- 30 GB month: the photographer was paused a day into delivering it. A file
-- now counts once a month, the first time any client link sends any of it.
-- What leaves the server is still counted, for a fair-use ceiling far above
-- any real month, which is what stops a link from becoming a free file host.
--
--   download_deliveries          One row per file per owner per month: the
--                                first time it went out. Its bytes are added
--                                to the month's delivered_bytes once; later
--                                downloads find the row and add nothing.
--
--   download_usage.delivered_bytes  This month's deliveries, what the plan's
--                                allowance is measured against. `bytes`
--                                keeps its meaning — every byte sent — and is
--                                what the fair-use ceiling reads.
--
--   download_usage.extra_bytes   Allowance staff added for this month only,
--                                from the console: the way out while no plan
--                                can be bought. With who and when, since it
--                                changes what an account may do.
--
-- This month's alert stamps are cleared: they were set against bytes sent,
-- and a photographer paused under that rule is not paused under this one.
-- Clearing them lets the 80% and pause alerts fire again on deliveries.
--
-- Additive. An older image ignores the new table and columns and goes on
-- counting `bytes`, which this one still writes.
set local lock_timeout = '5s';

create table if not exists download_deliveries (
  user_id   uuid not null references users (id) on delete cascade,
  month     date not null check (extract(day from month) = 1),
  file_key  text not null,
  bytes     bigint not null check (bytes >= 0),
  first_at  timestamptz not null default now(),
  primary key (user_id, month, file_key)
);

alter table download_usage
  add column if not exists delivered_bytes bigint not null default 0 check (delivered_bytes >= 0),
  add column if not exists extra_bytes bigint not null default 0 check (extra_bytes >= 0),
  add column if not exists extra_granted_by uuid,
  add column if not exists extra_granted_at timestamptz;

update download_usage
   set warned_at = null,
       paused_at = null
 where month = date_trunc('month', now() at time zone 'utc')::date;
