-- Workspaces that can be archived, given a cover, and followed: what has been
-- happening in them, and which albums new members get.
--
-- Additive only. The Windows deploy runs migrations before it starts the new
-- image, and rolls the image back without reversing them when the health gate
-- fails (docs/PRODUCTION_DEPLOYMENT.md). The release before this one never
-- reads or writes anything added here.

-- Archived workspaces leave the list but keep their albums, members and
-- sharing exactly as they were. Null is active.
alter table workspaces add column if not exists archived_at timestamptz;

-- The album whose cover stands for the workspace. Cleared if that album goes;
-- the card then falls back to the newest album with a cover, as before.
alter table workspaces
  add column if not exists cover_album_id text references albums(id) on delete set null;

-- What a member gets in albums added to the workspace after they joined. Null
-- shares nothing, which is what every album has had until now: new albums
-- start private and are shared on purpose.
alter table collaborators
  add column if not exists new_album_access text
    check (new_album_access in ('view', 'download', 'upload', 'manage'));

-- What has been happening in a workspace, for its overview.
--
-- `actor_id` did it; `subject_id` is who it was done to — the person invited,
-- removed, or given albums. Names are read from `users` when the feed is, so
-- a renamed account reads under its new name; `data` keeps a copy for the
-- account that has since been deleted.
--
-- Uploads arrive one file at a time, so they are folded into one row per
-- person, album and hour (`bucket`) with a running `count` — "uploaded 248
-- files", not 248 lines. Sections added are folded the same way. Everything
-- else is one row per event, with a null bucket.
--
-- An event about an album goes with the album: "uploaded 248 files to" an
-- album nobody can open any more is not something to show anyone.
create table if not exists workspace_activity (
  id           uuid        primary key default gen_random_uuid(),
  workspace_id text        not null references workspaces(id) on delete cascade,
  actor_id     uuid        references users(id) on delete set null,
  subject_id   uuid        references users(id) on delete set null,
  kind         text        not null,
  album_id     text        references albums(id) on delete cascade,
  count        integer     not null default 1,
  data         jsonb       not null default '{}'::jsonb,
  bucket       timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists workspace_activity_recent_idx
  on workspace_activity (workspace_id, created_at desc);

create index if not exists workspace_activity_album_idx
  on workspace_activity (album_id) where album_id is not null;

create unique index if not exists workspace_activity_bucket_idx
  on workspace_activity (workspace_id, actor_id, album_id, kind, bucket)
  where bucket is not null;
