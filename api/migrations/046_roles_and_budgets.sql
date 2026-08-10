-- A budget per role, and an application that says which role it is for.
--
-- One budget could not describe the shoot people actually post. A wedding
-- wanting a photographer, a videographer and an HMUA pays three different
-- rates, and "₱2,000–₱15,000" across all three tells a photographer nothing
-- and an HMUA nothing. Worse, the booking made on acceptance opened at the
-- post's `budget_max` — so whoever was hired started from the highest rate on
-- the post regardless of what they were hired to do.
--
-- Keyed by role name rather than a child table, because `roles_wanted` is
-- already the list and a second table would mean the two could disagree about
-- which roles a post wants. The service keeps the keys a subset of
-- `roles_wanted`; anything not named here has no stated budget, which is a
-- normal answer and the state every existing post is in.
--
--   {"Photographer": {"min": 800000, "max": 1200000}, "HMUA": {"min": 200000}}
--
-- Minor units, like every other money column here.
alter table hiring_posts
  add column if not exists role_budgets jsonb not null default '{}'::jsonb;

-- `budget_min` and `budget_max` stay, and stop being the truth: they are now
-- the rolled-up range across the roles, maintained on write. The board shows
-- one line per post and filters on a range, and neither wants to open a jsonb
-- document per row to do it.
comment on column hiring_posts.budget_min is
  'Lowest across role_budgets. Derived — set by HiringService, not by hand.';
comment on column hiring_posts.budget_max is
  'Highest across role_budgets. Derived — set by HiringService, not by hand.';

-- Existing posts: the post-level budget was the budget for every role on it,
-- which is exactly what it meant before this column existed.
update hiring_posts
   set role_budgets = (
     select coalesce(jsonb_object_agg(role, jsonb_strip_nulls(jsonb_build_object(
              'min', budget_min,
              'max', budget_max
            ))), '{}'::jsonb)
       from unnest(roles_wanted) as role
   )
 where role_budgets = '{}'::jsonb
   and roles_wanted is not null
   and (budget_min is not null or budget_max is not null);


-- Which role somebody is applying for.
--
-- Nullable, and null is a real answer for every application written before
-- this existed. The service requires it when the post wants more than one
-- role, and fills it in when there is only one — being asked to choose from a
-- list of one is a question with no information in it.
alter table hiring_applications
  add column if not exists role text;

-- Backfill what can be known for certain: a post that wanted exactly one role
-- leaves no ambiguity about what its applicants applied for.
update hiring_applications a
   set role = p.roles_wanted[1]
  from hiring_posts p
 where p.id = a.post_id
   and a.role is null
   and array_length(p.roles_wanted, 1) = 1;

-- The message stops being required.
--
-- It was 20 characters of prose before anyone could apply, written to a poster
-- who cannot reply until they have already accepted. The portfolio says more
-- about whether somebody can do the job than a paragraph does, and the two of
-- them can talk once there is a reason to.
--
-- The column stays, and stays nullable rather than being dropped: applications
-- already carry messages people wrote, and those are worth keeping.
alter table hiring_applications
  alter column message drop not null;
