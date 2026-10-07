-- Money: tax help.
--
-- One column. When a corporate client withholds tax from a fee, they owe the
-- creative a BIR Form 2307 for it, and without the form the credit can't be
-- claimed. This records that the creative has the form in hand — a tick,
-- nothing more: no TIN and no scan, which are sensitive personal information
-- under the Data Privacy Act and are not collected.
--
-- Additive only. Deploys roll the image back without reversing migrations.
set local lock_timeout = '5s';

alter table money_entries
  add column if not exists form_2307_at timestamptz;
