-- A way to pay, sent in a chat as a card.
--
-- The card is a message of its own kind. Its context names the sender's way
-- to pay by id, and the details are read fresh each time the thread is: the
-- same as a statement, which shows the details as they are now. Removing the
-- way to pay empties the card; changing it (which asks for the password, and
-- is emailed) changes what the card shows.
--
-- Additive only. Deploys roll the image back without reversing migrations;
-- an older image never writes this kind and shows an existing one as its
-- plain text body.
set local lock_timeout = '5s';

alter table messages
  drop constraint if exists messages_kind_check;
alter table messages
  add constraint messages_kind_check
  check (kind in ('text', 'job-accepted', 'pay-card'));
