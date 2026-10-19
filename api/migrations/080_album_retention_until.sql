-- An album can be kept until a date, as well as for a number of days.
--
-- retention_days deletes each file that many days after it was uploaded,
-- which suits "30 days after delivery". It cannot say "until 31 March", the
-- date in the contract, and a photographer asked for exactly that: they had
-- no way to pick the day their client's files go.
--
-- retention_until is that day, in Manila. Everything in the album is kept
-- through it and removed by the next sweep after it. One or the other, never
-- both: two clocks on one album would leave nobody sure which one wins.
set local lock_timeout = '5s';

alter table albums add column if not exists retention_until date;

alter table albums drop constraint if exists albums_retention_one_way;
alter table albums
  add constraint albums_retention_one_way
  check (retention_until is null or retention_days is null or retention_days = 0);
