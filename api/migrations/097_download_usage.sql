-- Client downloads: bytes served per account per calendar month.
--
-- Every plan includes a monthly download allowance (2x storage on Free, 3x on
-- the paid tiers; see quota.config.ts). This is the counter it is checked
-- against: one row per album owner per UTC month, keyed by the month's first
-- day, incremented as client-link downloads are served.
--
-- A counter rather than a log. A delivery is served in chunks — one zip entry,
-- one Range request — and a row per chunk would be a table that grows by the
-- thousand a day to answer one number. The increment is a single
-- `insert ... on conflict do update set bytes = bytes + excluded.bytes`, which
-- Postgres applies atomically on the row, so two downloads finishing at once
-- cannot overwrite each other's count.
--
-- Old months are kept; they are one small row each and are the only record of
-- what a gallery cost to serve.
--
-- Additive only. Deploys roll the image back without reversing migrations.
set local lock_timeout = '5s';

create table if not exists download_usage (
  user_id    uuid not null references users (id) on delete cascade,
  -- The first day of the month, UTC.
  month      date not null check (extract(day from month) = 1),
  bytes      bigint not null default 0 check (bytes >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, month)
);
