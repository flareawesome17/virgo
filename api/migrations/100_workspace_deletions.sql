-- Workspace deletions: which workspace went, when, and from which session.
--
-- Deleting a workspace takes its whole history with it — albums, members,
-- grants, links, the activity feed — and leaves nothing behind to say it was
-- ever there. On 2026-10-25 one was deleted and the time could only be pinned
-- by comparing nightly dumps with refresh-token rotations; which device did it
-- could not be found at all. This is the row that answers both.
--
--   workspace_id    No foreign key: the workspace is deleted for real in the
--                   end (see 101), and a key would have the cascade take this
--                   row with it.
--   workspace_name  As it was named when it was deleted.
--   user_id         Who deleted it, which can only be its owner. Goes with
--                   their account, like everything else about them.
--   album_count     Albums in it when it was deleted. Its files outlive it,
--                   out of any album.
--   member_count    Accepted members who lost it.
--   session_id      The refresh-token family (refresh_tokens.family_id) of the
--                   session that asked, which the console lists as a device.
--                   Null for an access token issued before tokens named one.
--   user_agent      The request's User-Agent. Never the IP address, as the
--                   privacy policy says.
--
-- Additive only. Deploys roll the image back without reversing migrations,
-- and an older image simply writes nothing here.
set local lock_timeout = '5s';

create table if not exists workspace_deletions (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   text not null,
  workspace_name text not null,
  user_id        uuid not null references users (id) on delete cascade,
  album_count    integer not null check (album_count >= 0),
  member_count   integer not null check (member_count >= 0),
  session_id     uuid,
  user_agent     text,
  deleted_at     timestamptz not null default now()
);

create index if not exists workspace_deletions_user_idx
  on workspace_deletions (user_id, deleted_at desc);

create index if not exists workspace_deletions_workspace_idx
  on workspace_deletions (workspace_id);
