-- A message can carry the id its sender's phone gave it.
--
-- A send that timed out after the server had already stored it came back as
-- "Not sent — tap to retry", and the retry stored the same words a second
-- time. The apps now make an id for each message before sending it; the same
-- sender sending the same id again gets the message that is already there,
-- not a copy. The app also uses the id to match the live copy of its own
-- message to the bubble it drew while sending.
--
-- Nullable. Everything sent before this has none, as do the app's own system
-- messages, and the partial index leaves all of those out of the check.
set local lock_timeout = '5s';

alter table messages add column if not exists client_id uuid;

create unique index if not exists messages_sender_client_id_key
    on messages (sender_id, client_id)
 where client_id is not null;
