-- Reporting a showcase, and taking one down.
--
-- Until now a report could only name an account. That was enough when the
-- only things strangers saw of each other were profiles and messages; a feed
-- of public photographs is a different surface, and "report the person who
-- posted it" is both heavier than the situation usually warrants and useless
-- for saying which post is the problem.
--
-- Its own table rather than a target_type on user_reports: that table's
-- target_id is a foreign key to users and its uniqueness is per account, and
-- making both nullable to fit two shapes would cost the constraint that stops
-- a report naming nothing.
--
-- Additive only. One table, one nullable column, no rewrites.
set local lock_timeout = '5s';

create table if not exists showcase_reports (
  id          uuid        primary key default gen_random_uuid(),
  -- Kept when the reporter deletes their account, like user_reports: the
  -- evidence outlives the person who gave it.
  reporter_id uuid        references users(id) on delete set null,
  showcase_id uuid        not null references showcases(id) on delete cascade,
  -- The same list as an account report, minus 'impersonation', which is about
  -- who somebody claims to be rather than about a photograph, plus the two
  -- that only make sense for work.
  reason      text        not null
                check (reason in ('spam', 'scam', 'harassment',
                                  'inappropriate', 'stolen_work',
                                  'wrong_credit', 'other')),
  note        text        check (note is null or char_length(note) <= 500),
  created_at  timestamptz not null default now(),

  -- One per reporter per showcase: a second report from the same person is
  -- the same complaint.
  constraint showcase_reports_once unique (reporter_id, showcase_id)
);

-- The console list, newest first.
create index if not exists showcase_reports_recent
  on showcase_reports (created_at desc);

-- "How many reports does this showcase have", on every row of that list.
create index if not exists showcase_reports_target
  on showcase_reports (showcase_id);


alter table showcases
  -- Taken down by the console. Deliberately NOT unpublished_at: that is the
  -- author's own switch and they can undo it, and a moderator's decision the
  -- author could reverse is not a moderation decision. Null is visible.
  --
  -- Every read that shows a showcase to somebody ELSE excludes it: the feed,
  -- a profile, a shelf. The author still sees it in their own list and can
  -- still open it, marked as taken down — a post that simply disappears
  -- teaches them nothing, and the one thing worse than moderating somebody is
  -- moderating them silently.
  add column if not exists hidden_at timestamptz;

-- The feed's partial indexes from 071 do not know about hidden_at, so they
-- would keep offering rows the query then discards. Rebuilt to match what the
-- feed actually asks for.
drop index if exists showcases_feed;
create index if not exists showcases_feed
  on showcases (published_at desc)
  where visibility = 'public'
    and published_at is not null
    and unpublished_at is null
    and hidden_at is null;

drop index if exists showcases_feed_kept;
create index if not exists showcases_feed_kept
  on showcases (kept_count desc, published_at desc)
  where visibility = 'public'
    and published_at is not null
    and unpublished_at is null
    and hidden_at is null;
