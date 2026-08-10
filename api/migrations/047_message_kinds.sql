-- Messages that are not somebody typing.
--
-- Accepting an applicant opens a conversation and leaves it empty. Both people
-- arrive at a blank thread and have to reconstruct from memory which job this
-- was, which of three roles was accepted, and what was agreed — while the
-- booking that answers all three sits on another screen entirely.
--
-- So acceptance writes the first message, and it is a card rather than a
-- sentence: the job, the role, the rate, and the terms to confirm, at the top
-- of the thread where it happened. It scrolls away as the conversation goes
-- on, which is right — it is a thing that happened on a date, not a permanent
-- banner. Hire a second person from the same post later and there is a second
-- card, in its place in the order.
alter table messages
  add column if not exists kind text not null default 'text',
  -- Whatever the card needs to render: which post, which role, which booking.
  -- Ids rather than a snapshot, because the booking's terms change and a card
  -- showing what they used to be would be worse than no card.
  add column if not exists context jsonb;

-- A closed set, checked here rather than only in TypeScript: `kind` decides
-- which component renders a row, and an unknown value would fall through to
-- the plain bubble and show a JSON blob as somebody's message.
alter table messages
  drop constraint if exists messages_kind_check;
alter table messages
  add constraint messages_kind_check
  check (kind in ('text', 'job-accepted'));
