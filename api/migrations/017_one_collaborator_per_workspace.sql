-- One row per person per workspace.
--
-- Nothing stopped inviting the same friend twice, which produced duplicate
-- entries in the collaborator list, two invitations to answer, and an ambiguous
-- answer to "what access does this person have?" — each row carried its own
-- role and its own album exclusions.

-- Collapse any existing duplicates before the constraint can be added, keeping
-- the oldest row so an already-accepted invitation is not discarded in favour
-- of a later pending one.
delete from collaborators c
 using collaborators keep
 where c.collaborator_user_id is not null
   and c.collaborator_user_id = keep.collaborator_user_id
   and c.workspace_id = keep.workspace_id
   and (
     keep.created_at < c.created_at
     or (keep.created_at = c.created_at and keep.id < c.id)
   );

create unique index if not exists collaborators_one_per_workspace_idx
  on collaborators (workspace_id, collaborator_user_id)
  where collaborator_user_id is not null;
