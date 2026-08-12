-- A referral pays both sides.
--
-- It paid the referrer only. The reason to change it is the free tier: the
-- person being invited has nothing yet, and an invitation that rewards only
-- the sender is a worse thing to send — "join and I get storage" does not
-- persuade anybody. Both now get the promo, the same one, from the same event.
--
-- Everything else about referrals is unchanged: still gated on the referred
-- account confirming its address, still one referral per account ever, still
-- expiring if unclaimed.

-- One grant per *recipient* per referral, rather than one grant per referral.
--
-- The old index allowed a single row per (promo, referred account), which is
-- exactly the row the referrer holds — so the referee's grant could not be
-- inserted at all. Adding user_id to the key keeps the property that matters
-- (nobody is paid twice for the same referral) while allowing the two people
-- it concerns to each hold one.
drop index if exists promo_grants_referral_key;

create unique index if not exists promo_grants_referral_key
  on promo_grants (promo_id, user_id, referred_user_id)
  where referred_user_id is not null;

-- When the code was entered, as distinct from when the account was made.
--
-- A code can now be entered from inside the app rather than only on the signup
-- form — most people are handed one after they have already joined, and a
-- field they can only reach by starting over is a field nobody uses. Recorded
-- so "how many referrals were retro-claimed" is answerable later.
alter table users
  add column if not exists referred_at timestamptz;

comment on column users.referred_at is
  'When referred_by_user_id was set. Null on rows that predate this column.';
