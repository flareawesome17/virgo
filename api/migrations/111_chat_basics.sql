-- Chat, phase 1: reactions, edits, forwarding, list state and saved replies.
--
-- Everything here is additive. An older API image ignores every new column
-- and table, so this can roll forward ahead of the code and back without it.

set local lock_timeout = '5s';

/*
 * Reactions: one per person per message, from a fixed set.
 *
 * Keys rather than emoji characters. "❤️" is two code points (the heart and a
 * variation selector), and a client that sends it without the selector would
 * be refused by a check on the character, or worse, stored as a seventh
 * reaction nobody can pick. The apps map each key to what they draw.
 *
 * One per person: reacting again replaces it, which is how every chat app
 * people already use behaves, and it keeps a busy group's counts honest.
 */
create table if not exists message_reactions (
  message_id uuid not null references messages(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  reaction   text not null
               check (reaction in ('like', 'love', 'haha', 'wow', 'sad', 'thanks')),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

/*
 * Editing your own message, for a short while after sending it.
 *
 * `edited_at` is what the apps show ("Edited"). The words it replaced are kept
 * in message_edits, so a report filed after an edit still shows what was
 * actually said. Unsending a message removes its history with it, the same
 * way it clears the text.
 */
alter table messages
  add column if not exists edited_at timestamptz,
  -- Sent with Forward rather than typed. Shown as a small label, so nobody
  -- reads a passed-on call time as the forwarder's own words.
  add column if not exists forwarded boolean not null default false;

create table if not exists message_edits (
  id          uuid primary key default gen_random_uuid(),
  message_id  uuid not null references messages(id) on delete cascade,
  body        text not null,
  replaced_at timestamptz not null default now()
);

create index if not exists message_edits_message_idx
  on message_edits (message_id, replaced_at);

/*
 * How each person keeps their own list: pinned to the top, archived out of
 * the way, or marked unread to come back to. Per participant, like mute,
 * because each is one person's decision about their own view.
 *
 * Timestamps where order or "since when" matters; a flag for "unread", which
 * is cleared the moment the thread is read.
 */
alter table conversation_participants
  add column if not exists pinned_at     timestamptz,
  add column if not exists archived_at   timestamptz,
  add column if not exists marked_unread boolean not null default false;

/*
 * Saved replies: the answers a creative types to every enquiry — rates,
 * what's included, the down payment. Kept on the server so they follow the
 * account to the web and the desktop app.
 */
create table if not exists saved_replies (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  title      text not null check (length(btrim(title)) between 1 and 60),
  body       text not null check (length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists saved_replies_user_idx
  on saved_replies (user_id, created_at);

drop trigger if exists set_saved_replies_updated_at on saved_replies;
create trigger set_saved_replies_updated_at
  before update on saved_replies
  for each row execute function set_updated_at();

/*
 * A reported message that had been edited: what it said before, oldest
 * first. Copied with the rest of the evidence at report time.
 */
alter table report_evidence
  add column if not exists earlier_bodies text[] not null default '{}';
