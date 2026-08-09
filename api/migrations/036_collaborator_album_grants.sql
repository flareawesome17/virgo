-- Album access becomes an explicit grant instead of an exclusion.
--
-- Migration 015 made albums inherit their workspace's collaborators, with
-- removal recorded as an exclusion. That default is the wrong way round for
-- how the product is actually used: a workspace holds several clients' shoots,
-- and creating an album silently handed it to everyone already in the
-- workspace. There was no moment at which the owner decided who could see a
-- new set of photographs — it had already happened.
--
-- So access is now a row that must exist, not a row that must be absent. A new
-- album starts private to its owner and is shared deliberately.
--
-- `media_access` carries what they may do with the files once they are in,
-- which had no representation at all before. Note that nothing enforces it
-- yet: storage is still owner-scoped (`assertOwned` in storage.service.ts), so
-- collaborators cannot reach media through any value of this column. It is
-- recorded now so the grant UI and the migration below only have to happen
-- once; the enforcement lands with the storage work.

create table if not exists collaborator_albums (
  collaborator_id text not null references collaborators(id) on delete cascade,
  album_id        text not null references albums(id) on delete cascade,
  -- view: see that it exists and browse it.  download: fetch the originals.
  -- upload: add to it.  manage: remove media from it.
  media_access    text not null default 'view'
    check (media_access in ('view', 'download', 'upload', 'manage')),
  created_at      timestamptz not null default now(),
  primary key (collaborator_id, album_id)
);

create index if not exists collaborator_albums_album_idx
  on collaborator_albums (album_id);

-- Backfill: one grant per album a collaborator can see *today*, so the day
-- after this migration nobody has gained or lost access. That means every
-- album in the collaborator's workspace except the ones already excluded —
-- the exclusions are honoured, not discarded.
--
-- `media_access` is derived from the role rather than defaulting flat, because
-- a reviewer and a photographer plainly do not want the same thing. It is the
-- closest reading of intent available from the old schema; owners can adjust
-- it once the grant editor ships.
insert into collaborator_albums (collaborator_id, album_id, media_access)
select c.id,
       a.id,
       case c.role
         when 'owner'        then 'manage'
         when 'photographer' then 'upload'
         when 'editor'       then 'upload'
         when 'reviewer'     then 'download'
         when 'client'       then 'view'
         else 'view'
       end
  from collaborators c
  join albums a on a.workspace_id = c.workspace_id
 where not exists (
         select 1
           from album_collaborator_exclusions x
          where x.collaborator_id = c.id
            and x.album_id = a.id)
on conflict (collaborator_id, album_id) do nothing;

-- Fully represented by the grants above, and meaningless under an allow-list:
-- excluding someone from an album they were never granted says nothing.
drop table if exists album_collaborator_exclusions;
