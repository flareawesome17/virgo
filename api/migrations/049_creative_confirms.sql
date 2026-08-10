-- One confirmation, not two.
--
-- The booking started as something both people confirmed. That made sense
-- while both could edit it. Once the poster became the only one who sets the
-- terms, their confirmation stopped meaning anything: they wrote the offer,
-- and clicking "I agree" underneath your own offer is a step with no decision
-- in it. It also let a poster sit on a booking they had authored and not
-- confirmed, which reads to the other person as hesitation about their own
-- terms.
--
-- So the poster writes the terms and the creative agrees to them, which is
-- what hiring somebody actually is.
--
-- `poster_confirmed_at` is kept and no longer written. Bookings agreed under
-- the old rule carry a real timestamp in it and deleting the column would
-- throw that away — it is history, not state.
comment on column job_bookings.poster_confirmed_at is
  'Legacy. The poster no longer confirms; they set the terms. Never written since 049.';

-- `locked_at` is now exactly "when the creative confirmed", and those two
-- columns move together from here.
comment on column job_bookings.locked_at is
  'When the creative agreed to the terms as they then stood. Cleared by any edit.';

-- A booking the creative had already confirmed, waiting on a poster whose
-- confirmation no longer exists, is agreed under the new rule. Anything the
-- creative has not confirmed stays unconfirmed, which is unchanged.
update job_bookings
   set locked_at = creative_confirmed_at
 where creative_confirmed_at is not null
   and locked_at is null
   and cancelled_at is null;
