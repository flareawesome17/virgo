-- Delivery receipts.
--
-- `last_read_at` already says when someone opened a thread. This says when the
-- messages actually reached their device, which is a different fact and the
-- one that distinguishes "sent" from "delivered": a message sitting on the
-- server because the recipient's phone is off is not the same as one waiting
-- unread on their lock screen.
--
-- Recorded from the recipient's own polling — their app asking for
-- conversations or a thread *is* the proof it arrived — so it needs no
-- acknowledgement protocol of its own.
alter table conversation_participants
  add column if not exists last_delivered_at timestamptz;

-- Backfill: anything already read was self-evidently delivered. Without this,
-- existing threads would show every past message as undelivered forever.
update conversation_participants
   set last_delivered_at = last_read_at
 where last_delivered_at is null
   and last_read_at is not null;
