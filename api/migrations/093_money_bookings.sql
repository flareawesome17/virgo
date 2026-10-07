-- Money meets bookings.
--
-- A booking both sides agreed is money: income for the creative, an expense
-- for whoever posted the job. Money now offers each of them the entry, filled
-- in from the booking, to record with a tap — offered, never written for them,
-- because only they know whether the money actually moved. After the shoot,
-- a creative who has not recorded being paid is asked once whether they were.
--
-- Additive only. Deploys roll the image back without reversing migrations.
set local lock_timeout = '5s';

-- The booking an entry was recorded from. SET NULL rather than cascade: a
-- booking goes when either person deletes their account, or with its post,
-- and the other person's ledger must not lose the money with it. The entry
-- already holds its own amount, date and who — copied, never read through.
alter table money_entries
  add column if not exists booking_id uuid references job_bookings (id) on delete set null;

create index if not exists money_entries_booking_idx
  on money_entries (booking_id)
  where booking_id is not null;

/*
 * What has happened between one person and the offer for one booking: when
 * they were asked "Got paid?", and whether they said "not this" to the offer.
 * One row per person and booking, written only when one of those happens;
 * no row is an offer nobody has acted on.
 */
create table if not exists money_booking_prompts (
  user_id      uuid not null references users (id) on delete cascade,
  booking_id   uuid not null references job_bookings (id) on delete cascade,
  nudged_at    timestamptz,
  dismissed_at timestamptz,
  primary key (user_id, booking_id)
);
