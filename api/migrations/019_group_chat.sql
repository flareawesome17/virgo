-- Chat: direct and group conversations.
--
-- Replaces the sender/recipient  table from 018, which could not
-- represent a group. It is dropped rather than migrated: no message had been
-- sent, so there is nothing to preserve, and carrying two shapes forward would
-- mean two implementations of every read.
drop table if exists messages;

-- One model for both kinds. A direct chat is a conversation with is_group
-- false and exactly two participants; a group has a title and any number.
-- Modelling direct messages as sender/recipient columns instead would have
-- meant a second, parallel implementation the moment groups were added.
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  is_group boolean not null default false,
  /** Groups only; direct chats are titled from the other participant. */
  title text,
  created_by uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists conversation_participants (
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  -- Drives unread counts without writing a row per message per member.
  last_read_at timestamptz,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

-- "Which conversations am I in?" runs on every visit to the chat list.
create index if not exists conversation_participants_user_idx
  on conversation_participants (user_id);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id uuid not null references users(id) on delete cascade,
  body text not null check (length(trim(body)) > 0 and length(body) <= 4000),
  created_at timestamptz not null default now()
);

-- Threads are read newest-first, so the ordering is part of the index.
create index if not exists messages_conversation_idx
  on messages (conversation_id, created_at desc);

drop trigger if exists set_conversations_updated_at on conversations;
create trigger set_conversations_updated_at
  before update on conversations
  for each row execute function set_updated_at();
