-- Chat, phase 2: Virgo things shared in a chat as cards.
--
-- Album photos, a booking, a job post, a post, a package and a planned date
-- each become a message kind. A card's context names the thing by id (album
-- photos also keep the client link made for them), and the details are read
-- fresh whenever the thread is, so nothing here copies a booking or a package.
--
-- After 110, which added 'pay-card': the list below keeps it. Both ship in the
-- same release, and the migrator applies files in name order on a fresh
-- database, so 110 cannot run after this one and drop the new kinds.
--
-- Additive only. An older API image never writes these kinds, and an older
-- app shows each one as its plain body, which carries the thing's link.
set local lock_timeout = '5s';

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
    'date-plan'
  ));
