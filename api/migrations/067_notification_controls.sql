-- Notifications someone can act on: delete one, mark one unread, and choose
-- which kinds reach them where.
--
-- Additive only. The Windows deploy runs migrations before it starts the new
-- image, and when the health gate fails it rolls the image back without
-- reversing them (docs/PRODUCTION_DEPLOYMENT.md). The release before this one
-- keeps working against it: it never reads `hidden_at` or
-- `notification_settings`, and its read marks still take `read_at` from the
-- column default.

-- An announcement is one row shared by everyone it concerns, so deleting it for
-- one person is a mark on their read row rather than a delete. Marking it
-- unread clears the read time instead of removing the row, which would also
-- forget that it had been hidden.
alter table app_update_reads alter column read_at drop not null;
alter table app_update_reads add column if not exists hidden_at timestamptz;

-- Which kinds of notification reach an account on which channel. One row per
-- account, written the first time they change anything. No row, and any kind or
-- channel missing from `channels`, means on: what every account had before this
-- existed. The notification list keeps everything either way.
create table if not exists notification_settings (
  user_id    uuid        primary key references users(id) on delete cascade,
  channels   jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
