-- Notifications that survive not being online for them.
--
-- Until now a notification was a socket frame and an email and nothing else.
-- If the app was shut when it landed, the only record was in your inbox — so
-- somebody applied to your job, or answered your application, and the app
-- itself showed no sign it had ever happened. Every badge in the product
-- counts something *else* (unanswered applications, unread messages) and each
-- one had to be derived by hand from its own table.
--
-- This is the record. Written by NotifyService for every topic, so a feature
-- that notifies is durable by construction rather than by remembering to.
create table if not exists notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid        not null references users(id) on delete cascade,
  -- Not an enum and not a foreign key: the topic list lives in
  -- realtime.gateway.ts and gains entries with features. A constraint here
  -- would mean a migration every time one is added, to buy nothing — nothing
  -- reads this column except the client, to pick an icon.
  topic      text        not null,
  title      text        not null,
  body       text        not null,
  -- The same payload the socket frame and the push carry, so a notification
  -- opened from this list routes exactly where it would have from a tap.
  data       jsonb       not null default '{}'::jsonb,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

-- The list, newest first, which is the only way it is ever read.
create index if not exists notifications_user_idx
  on notifications (user_id, created_at desc);

-- The badge. Partial, because the unread ones are a small and shrinking
-- fraction of the table and the count is asked for on every poll.
create index if not exists notifications_unread_idx
  on notifications (user_id)
  where read_at is null;
