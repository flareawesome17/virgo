-- Albums inherit their workspace's collaborators.
--
-- Access is not stored per album: a collaborator belongs to a workspace, and
-- every album in that workspace is theirs by default. Recording each album
-- membership separately would mean a new album silently excluded everyone until
-- they were re-added one by one.
--
-- Removal is therefore an exclusion, not a missing row. Taking someone off one
-- album leaves the workspace membership — and every other album — untouched,
-- and putting them back is deleting the exclusion.

create table if not exists album_collaborator_exclusions (
  id uuid primary key default gen_random_uuid(),
  album_id text not null references albums(id) on delete cascade,
  collaborator_id text not null references collaborators(id) on delete cascade,
  -- The album owner. Carried so exclusions can be authorised and cleaned up
  -- without joining through two tables on every check.
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- One exclusion per pair; excluding twice is the same state as excluding once.
create unique index if not exists album_collaborator_exclusions_pair_idx
  on album_collaborator_exclusions (album_id, collaborator_id);

-- Postgres does not index foreign keys automatically, and the album lookup runs
-- on every read of an album's collaborator list.
create index if not exists album_collaborator_exclusions_album_idx
  on album_collaborator_exclusions (album_id);
create index if not exists album_collaborator_exclusions_user_idx
  on album_collaborator_exclusions (user_id);
