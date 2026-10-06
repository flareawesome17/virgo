-- The support desk: queues a team can split, a response target per ticket,
-- canned replies, a bell for staff, and a place for desk-wide settings.
set local lock_timeout = '5s';

/*
 * Tickets gain a category staff set while triaging, and `due_at`: when the
 * first reply is owed, from the ticket's priority (SUPPORT_TARGET_HOURS in
 * support.service.ts). Answered tickets keep theirs, so "answered in time"
 * stays answerable after the fact.
 */
alter table support_tickets
  add column if not exists category text
    check (category is null or category in
      ('account', 'billing', 'uploads', 'sharing', 'bookings', 'bug', 'feedback', 'other')),
  add column if not exists due_at timestamptz;

-- Tickets already waiting get a target from when they were opened, so the
-- queue's "overdue" means something on the first day.
update support_tickets
   set due_at = created_at + case priority
                  when 'urgent' then interval '1 hour'
                  when 'high' then interval '4 hours'
                  when 'normal' then interval '24 hours'
                  else interval '72 hours' end
 where due_at is null;

create index if not exists support_tickets_queue_idx
  on support_tickets (status, assigned_to, updated_at desc);

/*
 * Canned replies. `set_status` is what sending one does to the ticket —
 * "Fixed on our side" resolves it — so the common answer is one click.
 */
create table if not exists support_macros (
  id              uuid primary key default gen_random_uuid(),
  title           text not null check (char_length(title) between 1 and 80),
  body            text not null check (char_length(body) between 1 and 4000),
  set_status      text check (set_status is null or set_status in ('pending', 'resolved', 'closed')),
  created_by      uuid references admin_users (id) on delete set null,
  created_by_name text,
  use_count       integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

/*
 * The console's bell: a ticket arrived, was handed to you, or its customer
 * wrote back. Per staff member, deleted with them.
 */
create table if not exists admin_notifications (
  id         uuid primary key default gen_random_uuid(),
  admin_id   uuid not null references admin_users (id) on delete cascade,
  kind       text not null check (kind in ('ticket.new', 'ticket.assigned', 'ticket.reply')),
  ticket_id  uuid references support_tickets (id) on delete cascade,
  title      text not null,
  body       text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists admin_notifications_admin_idx
  on admin_notifications (admin_id, created_at desc);

/* Desk-wide switches, one row each. */
create table if not exists admin_settings (
  key        text primary key,
  value      jsonb not null,
  updated_by uuid references admin_users (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into admin_settings (key, value) values ('support.autoAssign', 'false'::jsonb)
on conflict (key) do nothing;
