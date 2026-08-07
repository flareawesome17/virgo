-- When you last looked at the job board.
--
-- The badge counts posts newer than this. Without a marker the only options
-- are "unread forever" or a count that resets on app restart, and neither is
-- what a badge is supposed to mean.
--
-- Null means never looked, which is the honest state for every existing
-- account: their first visit shows everything currently open as new, which is
-- true — they have not seen any of it.
alter table users add column if not exists jobs_seen_at timestamptz;

-- The badge query: open, visible, unexpired posts newer than a timestamp.
-- created_at is what it orders and filters on.
create index if not exists hiring_posts_created_open_idx
  on hiring_posts (created_at desc)
  where status = 'open' and hidden_at is null;
