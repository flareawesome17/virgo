-- Lets an account carry the Business plan.
--
-- PLAN_CATALOGUE has offered `business` since the tiers were renamed, but the
-- constraint from 028 was never widened, so the console's plan picker accepted
-- it and the database refused it with a 500. `pro` stays: it is the alias old
-- accounts still carry.
set local lock_timeout = '5s';

alter table users drop constraint if exists users_plan_check;
alter table users
  add constraint users_plan_check
  check (plan in ('free', 'freelance', 'studio', 'business', 'pro'));
