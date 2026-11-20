-- Chat, phase 5: voice notes.
--
-- Up to two minutes, held to record on a phone or clicked to record on web
-- and desktop. They ride on 114's attachments: counted toward the sender's
-- storage, gone when unsent, when nobody in the chat can see them any more,
-- or with the sender's account, and held while a report on them is open.
--
-- After 114: the kind list below keeps everything 110, 112, 113 and 114
-- added. The migrator applies files in name order, so none of them can run
-- after this.
--
-- Additive. An older API image ignores the new kind and columns; an older
-- app shows a voice note as its plain line ("Sent a voice note (0:32)").
set local lock_timeout = '5s';

/*
 * 'voice': a message carrying one voice note. Its body is the plain line the
 * list, the push and an older app show.
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
    'file',
    'voice'
  ));

/*
 * A voice note is an attachment like a photo. Whatever the phone or browser
 * recorded (AAC from a phone, Opus in WebM from most browsers) is re-encoded
 * on arrival as AAC in an .m4a, the one thing every phone and browser plays.
 */
alter table message_attachments
  drop constraint if exists message_attachments_kind_check;
alter table message_attachments
  add constraint message_attachments_kind_check
  check (kind in ('photo', 'file', 'voice'));

/*
 * How long it is: what the sender's app said when it was signed, then what
 * the server measured once it arrived.
 */
alter table message_attachments
  add column if not exists duration_ms integer
  check (duration_ms is null or duration_ms between 0 and 600000);

/*
 * Its shape, drawn as bars in the bubble: 48 levels from 0 to 100, measured
 * on arrival. Null until then, and the apps draw a flat line.
 */
alter table message_attachments
  add column if not exists waveform smallint[];
