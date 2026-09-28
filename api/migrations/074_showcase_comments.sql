-- Comments on a showcase.
--
-- `allow_comments` has been a column on showcases since 071 with nothing
-- behind it — the composer had no switch and there was nowhere to write one.
-- This is the thing it was always describing.
--
-- Additive only: one table, one column with a constant default. The release
-- before this cannot see either and a rollback reverses nothing.
set local lock_timeout = '5s';

create table if not exists showcase_comments (
  id          uuid        primary key default gen_random_uuid(),
  showcase_id uuid        not null references showcases(id) on delete cascade,
  -- Deleted with the account, unlike a report's reporter. A report is evidence
  -- somebody gave about another person and outlives them; a comment is that
  -- person speaking, and somebody who leaves should not keep talking.
  user_id     uuid        not null references users(id) on delete cascade,
  -- Trimmed length, so a comment of nothing but spaces is refused by the shape
  -- rather than by a service remembering to check.
  body        text        not null
                check (char_length(btrim(body)) between 1 and 1000),
  created_at  timestamptz not null default now()
);

-- One thread, oldest first, which is how a conversation reads.
create index if not exists showcase_comments_thread
  on showcase_comments (showcase_id, created_at, id);

-- "What has this person said", for an account page and for a wipe.
create index if not exists showcase_comments_user
  on showcase_comments (user_id, created_at desc);

alter table showcases
  -- Denormalised for the same reason kept_count and like_count are: the feed
  -- prints it on every card, and a count(*) per row is the query that does not
  -- survive a scroll.
  add column if not exists comment_count integer not null default 0;


-- Recomputed rather than incremented, like the other two counts: a ±1 that
-- runs twice or not at all drifts silently, and a count that is only ever
-- printed looks identical whether it is right or wrong.
create or replace function showcase_recount_comments() returns trigger
language plpgsql as $$
declare
  target uuid := coalesce(new.showcase_id, old.showcase_id);
begin
  -- On a cascade from `delete from showcases` the row is already gone and this
  -- matches nothing, which is correct.
  update showcases s
     set comment_count = (
           select count(*) from showcase_comments c where c.showcase_id = target
         )
   where s.id = target;
  return null;
end;
$$;

drop trigger if exists showcase_comments_recount on showcase_comments;

create trigger showcase_comments_recount
  after insert or delete or update of showcase_id on showcase_comments
  for each row execute function showcase_recount_comments();
