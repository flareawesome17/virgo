-- Chat, phase 4: photos and files from your device.
--
-- Up to ten photos, or one PDF, in a message. They count toward the sender's
-- storage, and go when the message is unsent, when nobody in the chat can see
-- it any more, or with the sender's account. A message under an open report
-- keeps its files until the report is closed.
--
-- After 113: the kind list below keeps everything 110, 112 and 113 added. The
-- migrator applies files in name order, so none of them can run after this.
--
-- Additive. An older API image ignores the new table; an older app shows a
-- photo or file message as its plain line ("Sent 4 photos" and the caption).
set local lock_timeout = '5s';

/*
 * 'photos' and 'file': a message that carries attachments. The body is the
 * plain line the list, the push and an older app show; the caption the sender
 * typed is in `context`, and the attachments are rows below.
 */
alter table messages
  drop constraint if exists messages_kind_check;
alter table messages
  add constraint messages_kind_check
  check (kind in (
    'text',
    'job-accepted',
    'pay-card',
    'album-photos',
    'booking',
    'job-post',
    'post',
    'package',
    'date-plan',
    'notice',
    'photos',
    'file'
  ));

/*
 * A photo or file sent in a chat.
 *
 * Its own table rather than user_files, the way receipts and support files
 * are: user_files is an album library, and everything that walks it (the
 * library, unfiled uploads, processing, retention, zips, downloads) would
 * have to learn to step round chat. What it shares with the library is the
 * storage it counts toward, added in QuotaService.storageUsed.
 *
 * A row is written when the upload is signed, so a burst of tickets cannot
 * spend storage the account does not have: `size_bytes` is what was declared
 * until the upload is checked, then what B2 holds.
 *
 * The message is written before the bytes arrive ("words first" on a weak
 * signal), so a row can be on a message and still `uploading`. One that never
 * finishes is marked `failed` a day on, and its object removed.
 */
create table if not exists message_attachments (
  id              uuid primary key default gen_random_uuid(),
  -- Whose storage it is. Account deletion erases these before the account
  -- row goes (ChatFilesService.eraseFor), so the cascade only ever meets
  -- rows with no object left.
  user_id         uuid not null references users(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  -- Null until it is sent, and again if the message itself goes. Either way
  -- the sweep then removes it.
  message_id      uuid references messages(id) on delete set null,
  position        smallint not null default 0 check (position between 0 and 9),
  kind            text not null check (kind in ('photo', 'file')),
  status          text not null default 'uploading'
                  check (status in ('uploading', 'ready', 'failed')),
  key             text not null unique,
  -- A photo's small copy for the thread, and its ~300-byte blurred stand-in.
  thumb_key       text,
  blur            text,
  name            text not null,
  content_type    text not null,
  size_bytes      bigint not null check (size_bytes >= 0),
  width_px        integer,
  height_px       integer,
  pages           integer,
  created_at      timestamptz not null default now(),
  ready_at        timestamptz
);

-- Storage used, and the "chats using the most" list on the storage screen.
create index if not exists message_attachments_user_idx
  on message_attachments (user_id, conversation_id);
-- Filling in a thread's messages.
create index if not exists message_attachments_message_idx
  on message_attachments (message_id, position) where message_id is not null;
-- The sweep: never sent, or never finished.
create index if not exists message_attachments_pending_idx
  on message_attachments (created_at) where message_id is null or status = 'uploading';
