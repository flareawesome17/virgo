-- Likes on a showcase.
--
-- Lighter than keeping. Keeping says "I want this where I can find it again"
-- and asks somebody to choose a shelf; a like says "I saw this and it landed",
-- costs one tap, and is the thing people actually do. Both exist because they
-- mean different things — a feed with only the heavy one gets very little
-- signal, and a feed with only the light one has no taste in it.
--
-- Additive only: one new table and one new column with a constant default,
-- which Postgres records in the catalogue rather than rewriting the table. The
-- release before this one cannot see either, so a rollback reverses nothing.
set local lock_timeout = '5s';

create table if not exists showcase_likes (
  showcase_id uuid        not null references showcases(id) on delete cascade,
  user_id     uuid        not null references users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  -- The pair IS the key: one like per person per showcase, enforced by the
  -- shape rather than by a service remembering to check. A second like is
  -- then an upsert that changes nothing, not a duplicate row.
  primary key (showcase_id, user_id)
);

-- "What have I liked", for drawing the heart filled on a feed page, and for
-- somebody's own list of them later.
create index if not exists showcase_likes_user
  on showcase_likes (user_id, created_at desc);

alter table showcases
  -- Denormalised for the same reason kept_count is: the feed prints it on
  -- every card, and a count(*) per row is the query that does not survive a
  -- scroll.
  add column if not exists like_count integer not null default 0;


-- Recomputed, not incremented — the same argument as kept_count in 071. A ±1
-- that runs twice or not at all drifts silently, and a count that is only ever
-- printed looks identical whether it is right or wrong.
--
-- Simpler than kept_count's, though: one person can keep a showcase on several
-- shelves, so that one counts DISTINCT user_id. Here the primary key already
-- makes a person's like unique, so a plain count is the truth.
create or replace function showcase_recount_likes() returns trigger
language plpgsql as $$
declare
  target uuid := coalesce(new.showcase_id, old.showcase_id);
begin
  -- On a cascade from `delete from showcases` the row is already gone and this
  -- update matches nothing, which is correct.
  update showcases s
     set like_count = (select count(*) from showcase_likes l where l.showcase_id = target)
   where s.id = target;
  return null;
end;
$$;

drop trigger if exists showcase_likes_recount on showcase_likes;

create trigger showcase_likes_recount
  after insert or delete or update of showcase_id on showcase_likes
  for each row execute function showcase_recount_likes();
