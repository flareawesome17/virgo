-- Safety before strangers can reach you: blocking, reporting people, a console
-- suspension that actually stops an account, and friend requests that no
-- longer hand out email addresses.
--
-- Additive only. The Windows deploy runs migrations before it starts the new
-- image, and rolls the image back without reversing them when the health gate
-- fails (docs/PRODUCTION_DEPLOYMENT.md). The release before this one never
-- reads user_blocks, user_reports, users.suspended_at or friends.declined_at;
-- its `select *` / `returning *` on friends carries the new column along and
-- the clients ignore it. friends_pair_idx, the ON CONFLICT target of every
-- friend upsert in both images, and the status / requested_by checks are
-- untouched. The data changes below fill the two new columns, which that
-- release never reads, and remove friend_email values, which every screen in
-- the live app already renders as a null.

-- Both tables this file alters, locked before anything else, with a bounded
-- wait.
--
-- The previous image keeps serving while this runs: the deploy migrates
-- before it replaces the container. Its friend writes hold friends and then
-- ask for users (the friend_user_id foreign key), and its people search reads
-- them the other way round, so no single order is safe against all of it and
-- the order is not the fix. The bound is. Waiting here, in one statement, for
-- at most five seconds turns a busy moment or a deadlock into a clean failed
-- deploy that rolls back and can simply be run again, instead of requests
-- queueing behind a migration that is itself queueing. SET LOCAL holds for
-- this file's transaction only; the migrator runs each file in one.
set local lock_timeout = '5s';
lock table users, friends in access exclusive mode;

-- One person keeping another away from them.
--
-- A row records that blocker_id chose it; every check reads it in both
-- directions, because being blocked has to look exactly like the other person
-- not being there. Deleting either account removes the block with it.
create table if not exists user_blocks (
  id                  uuid        primary key default gen_random_uuid(),
  blocker_id          uuid        not null references users(id) on delete cascade,
  blocked_id          uuid        not null references users(id) on delete cascade,
  -- What the blocker could see of them when they blocked. The blocked list
  -- reads these rather than the live account, which would keep showing every
  -- later change — a new name, a new photo, a handle they just published — to
  -- someone who asked never to see them again.
  blocked_name        text        not null,
  blocked_handle      text,
  blocked_avatar_url  text,
  created_at          timestamptz not null default now(),
  constraint user_blocks_not_self check (blocker_id <> blocked_id),
  constraint user_blocks_pair_key unique (blocker_id, blocked_id)
);

-- The second arm of every "either of them blocked the other" check. The unique
-- constraint's index serves the first arm and the blocker's own list.
create index if not exists user_blocks_blocked_idx
  on user_blocks (blocked_id, blocker_id);

-- Somebody reported an account.
--
-- One per reporter per target: a second report from the same person is the
-- same complaint, and answering it "thanks" without a second email is right.
-- The reporter is kept as null when they delete their account, unlike job
-- reports, because the evidence outlives the person who gave it. The reason
-- list is enforced here as well as in the DTO; nothing older writes this table.
create table if not exists user_reports (
  id           uuid        primary key default gen_random_uuid(),
  reporter_id  uuid        references users(id) on delete set null,
  target_id    uuid        not null references users(id) on delete cascade,
  reason       text        not null
                 check (reason in ('spam', 'scam', 'harassment',
                                   'impersonation', 'inappropriate', 'other')),
  note         text        check (note is null or char_length(note) <= 500),
  -- Where in the app the report was made, for triage.
  source       text        check (source is null or source in
                 ('profile', 'chat', 'nearby', 'applicants', 'enquiries', 'job',
                  'requests')),
  created_at   timestamptz not null default now(),
  constraint user_reports_once unique (reporter_id, target_id)
);

-- The console list, newest first.
create index if not exists user_reports_recent_idx
  on user_reports (created_at desc);

-- "How many reports does this account have", on every list row and email.
create index if not exists user_reports_target_idx
  on user_reports (target_id);

-- A console suspension. Separate from disabled_at, which a self-pause also
-- sets and keeps after it lifts, so it cannot mean "suspended" on its own.
-- Null is not suspended. Nothing lifts it but the console.
alter table users add column if not exists suspended_at timestamptz;

-- Accounts staff suspended through the old console, which never enforced it.
--
-- Its "Disable account" set disabled_at and wrote a 'user.disable' audit row,
-- and showed the account as disabled, but sign-in only ever read
-- disabled_until, so nothing stopped them. Left null here they would drop out
-- of the console's suspended list in the release that makes suspension hold.
-- The audit log says which accounts those are; disabled_at cannot, because a
-- self-pause sets it too and keeps it afterwards. An account counts when the
-- last console disable or enable on it was a disable, and is dated from that
-- row. The previous image never reads the column, so a rollback is
-- unaffected. target_id is the path the console called, stored as text, so it
-- is compared lowercased.
update users u
   set suspended_at = latest.created_at
  from (select distinct on (lower(l.target_id))
               lower(l.target_id) as user_id, l.action, l.created_at
          from admin_audit_log l
         where l.target_type = 'user'
           and l.action in ('user.disable', 'user.enable')
         order by lower(l.target_id), l.created_at desc) latest
 where latest.action = 'user.disable'
   and u.id::text = latest.user_id
   and u.suspended_at is null;

-- When a friend request was declined, for the 30-day window in which asking
-- again is held silently. updated_at cannot serve: the friends trigger rewrites
-- it on every update, including the email fix below. Kept by the trigger at
-- the end of this file, never by the services.
alter table friends add column if not exists declined_at timestamptz;

-- Before the email fix, which bumps updated_at on the rows it touches: this
-- reads each declined row's updated_at while it still says when it was declined.
update friends
   set declined_at = updated_at
 where status = 'declined'
   and declined_at is null;

-- Email addresses copied onto a row without the other person's say.
--
-- A request used to store the target's address on the requester's row and the
-- requester's on the target's, before either had agreed to anything. Those go.
-- A friendship both sides accepted keeps its copies: the API no longer shows
-- them, but the release before this one does, and a rollback should not empty
-- the addresses friends already had of each other. Rows with no account behind
-- them (friend_user_id null) are the owner's own typed contacts and keep what
-- they typed.
update friends f
   set friend_email = null
 where f.friend_user_id is not null
   and f.friend_email is not null
   and not (
         f.status = 'accepted'
     and exists (select 1
                   from friends b
                  where b.user_id = f.friend_user_id
                    and b.friend_user_id = f.user_id
                    and b.status = 'accepted')
   );

-- Stamps declined_at whenever a row becomes declined, and clears it whenever
-- one stops being declined.
--
-- A trigger rather than the services, because both images write status: the
-- release before this one declines requests and re-sends them without knowing
-- the column exists, and a decline it records during a rollback must still
-- start the window. A declined row that is written again (a rename, the email
-- fix above) keeps its original time. Created after the backfill and the fix,
-- which do not name status and so would not fire it anyway.
--
-- The nested IF keeps OLD out of the INSERT branch, where it does not exist.
create or replace function friends_track_declined() returns trigger
language plpgsql as $$
begin
  if new.status = 'declined' then
    if tg_op = 'INSERT' then
      new.declined_at := now();
    elsif old.status is distinct from 'declined' then
      new.declined_at := now();
    end if;
  else
    new.declined_at := null;
  end if;
  return new;
end $$;

drop trigger if exists friends_track_declined on friends;
create trigger friends_track_declined
  before insert or update of status on friends
  for each row
  execute function friends_track_declined();
