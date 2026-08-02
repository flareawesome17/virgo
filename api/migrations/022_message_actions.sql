-- Replies, deletion and mentions.

alter table messages
  -- Null once the quoted message is hard-deleted, so a reply outlives what it
  -- answered rather than disappearing with it.
  add column if not exists reply_to_id uuid references messages(id) on delete set null,
  -- Set by "delete for everyone". The row survives as a tombstone so replies
  -- and ordering stay intact; the text itself is cleared, not hidden.
  add column if not exists deleted_at timestamptz,
  -- Who was mentioned. Ids rather than parsed text: a display name can change
  -- or repeat, and the notification has to reach an account.
  add column if not exists mentions uuid[] not null default '{}';

-- The original constraint required a non-empty body, which a tombstone cannot
-- satisfy. Emptiness is now allowed only for a deleted message, so an ordinary
-- message still cannot be blank.
alter table messages drop constraint if exists messages_body_check;
alter table messages add constraint messages_body_check
  check (
    length(body) <= 4000
    and (deleted_at is not null or length(trim(body)) > 0)
  );

-- "Delete for myself": one row per person who hid a message. Separate from
-- `deleted_at` because the two are genuinely different acts — one changes only
-- your view, the other removes the message from the conversation.
create table if not exists message_deletions (
  message_id uuid not null references messages(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

-- Reading a thread filters against this on every message.
create index if not exists message_deletions_user_idx
  on message_deletions (user_id);
