-- The customer's side of the support desk: files on a message, and a rating
-- once a ticket is done.

/*
 * Files attached to support messages, kept in B2 under `support/`.
 *
 * Not `user_files`: a screenshot sent to support is not part of anyone's
 * library, so it never counts against their storage or shows up among their
 * files. A row is written when the upload is signed and stays pending
 * (message_id null) until it is sent with a message; pending rows older than
 * a day are swept with their objects. A customer's files go with their
 * account.
 */
create table if not exists support_attachments (
  id           uuid primary key default gen_random_uuid(),
  key          text not null unique,
  name         text not null,
  content_type text not null,
  size_bytes   bigint not null,
  -- Who uploaded it: a customer through the app, or staff through the console.
  user_id      uuid references users (id) on delete set null,
  admin_id     uuid references admin_users (id) on delete set null,
  ticket_id    uuid references support_tickets (id) on delete cascade,
  message_id   uuid references support_messages (id) on delete cascade,
  created_at   timestamptz not null default now(),
  attached_at  timestamptz
);

create index if not exists support_attachments_message_idx
  on support_attachments (message_id);
create index if not exists support_attachments_pending_idx
  on support_attachments (created_at) where message_id is null;
create index if not exists support_attachments_user_idx
  on support_attachments (user_id) where user_id is not null;

/* How it went, in the customer's words: 1 to 5, and a comment if they like. */
alter table support_tickets
  add column if not exists rating         smallint check (rating between 1 and 5),
  add column if not exists rating_comment text,
  add column if not exists rated_at       timestamptz;

/* A rating rings whoever holds the ticket. */
alter table admin_notifications drop constraint if exists admin_notifications_kind_check;
alter table admin_notifications add constraint admin_notifications_kind_check
  check (kind in ('ticket.new', 'ticket.assigned', 'ticket.reply', 'ticket.rated'));
