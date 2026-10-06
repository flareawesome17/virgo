-- Outreach: saved audiences, messages sent to them, and announcements from
-- the console.

/*
 * A segment: a saved set of filters over the people list, counted live.
 *
 * The filters are the people list's own (plan, status, last seen, tag,
 * platform, two-factor, storage, signup date, referral, app version), stored
 * as the console sends them and checked by the API on every use, so a
 * segment is always counted and sent the way the list would show it.
 */
create table if not exists segments (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (char_length(btrim(name)) between 1 and 80),
  description     text check (description is null or char_length(description) <= 300),
  filters         jsonb not null default '{}'::jsonb,
  created_by      uuid references admin_users (id) on delete set null,
  created_by_name text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

/*
 * A broadcast: an in-app notification, and a push where people allow it, to
 * everyone in an audience.
 *
 * The audience is copied (`filters`) when it is scheduled, so editing the
 * segment afterwards cannot change who a scheduled message goes to. Sending
 * is a batch a minute, `per_minute` at a time, walked in account-id order
 * from `cursor` — so it can be throttled, survives a restart where it left
 * off, and never sends anyone the same broadcast twice.
 */
create table if not exists broadcasts (
  id              uuid primary key default gen_random_uuid(),
  title           text not null check (char_length(btrim(title)) between 1 and 80),
  body            text not null check (char_length(btrim(body)) between 1 and 600),
  url             text check (url is null or url ~ '^https://'),
  segment_id      uuid references segments (id) on delete set null,
  segment_name    text,
  filters         jsonb not null default '{}'::jsonb,
  push            boolean not null default true,
  status          text not null default 'scheduled'
    check (status in ('scheduled', 'sending', 'sent', 'cancelled')),
  send_at         timestamptz not null default now(),
  per_minute      integer not null default 1000 check (per_minute between 50 and 20000),
  started_at      timestamptz,
  finished_at     timestamptz,
  cursor          uuid,
  -- How many it was meant for when sending began, and what happened.
  recipients      integer,
  delivered       integer not null default 0,
  pushed          integer not null default 0,
  push_failed     integer not null default 0,
  created_by      uuid references admin_users (id) on delete set null,
  created_by_name text,
  cancelled_by_name text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists broadcasts_due_idx
  on broadcasts (send_at) where status in ('scheduled', 'sending');

-- "How many opened it": the notifications a broadcast became, by its id.
create index if not exists notifications_broadcast_idx
  on notifications ((data ->> 'broadcastId')) where data ? 'broadcastId';

/* Announcements made from the console say who made them and how many phones they reached. */
alter table app_updates
  add column if not exists pushed          integer,
  add column if not exists created_by_name text;
