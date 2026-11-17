-- How clients pay you, kept safe.
--
-- A way to pay decides where a client's money goes, so the danger is a swap:
-- someone signed in to the account (as on 2026-10-25) putting their own QR
-- code in place of the owner's. Adding, changing or removing one now asks
-- for the password, or with two-factor on the code emailed for it — the
-- same two steps as deleting an album — and the statement tells a client
-- when the details last changed, with a warning for a day after.
--
-- Additive only. Deploys roll the image back without reversing migrations.
set local lock_timeout = '5s';

-- When the details a client pays to last changed: kind, bank, name, number
-- or QR code. Not updated_at, which moving a method to the top also bumps;
-- making a method the main one changes nothing a client sends money to.
alter table money_pay_methods
  add column if not exists details_changed_at timestamptz;

-- Nothing but a details edit has ever touched a row, so updated_at is when
-- its details last changed. The touch trigger is off for the copy, or it
-- would stamp every row's updated_at with now() on the way.
alter table money_pay_methods disable trigger money_pay_methods_set_updated_at;
update money_pay_methods
   set details_changed_at = updated_at
 where details_changed_at is null;
alter table money_pay_methods enable trigger money_pay_methods_set_updated_at;

alter table money_pay_methods
  alter column details_changed_at set default now(),
  alter column details_changed_at set not null;

-- The emailed code for a pay-details change, beside the one for a delete.
alter table two_factor_challenges
  drop constraint if exists two_factor_challenges_purpose_check;
alter table two_factor_challenges
  add constraint two_factor_challenges_purpose_check
  check (purpose in ('setup', 'login', 'disable', 'recovery', 'delete', 'pay_details'));
