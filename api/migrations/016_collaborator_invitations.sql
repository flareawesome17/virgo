-- Makes a collaborator an invitation the other person can see and answer.
--
-- A collaborator row is owned by the inviter (`user_id`), so until now the
-- person being added had no row of their own, no notification, and no way to
-- accept — being "invited" meant appearing in someone else's list without ever
-- being told. `collaborator_user_id` (migration 014) is what makes the invitee
-- addressable; this adds the state machine on top.

alter table collaborators
  add column if not exists status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined'));

alter table collaborators
  add column if not exists responded_at timestamptz;

-- Rows created before invitations existed were effectively already in force.
-- Leaving them 'pending' would silently revoke access the owner believes they
-- granted, so they are marked accepted rather than requiring a re-invite.
update collaborators
   set status = 'accepted'
 where status = 'pending'
   and created_at < now() - interval '1 minute';

-- The invitee reads "invitations addressed to me" by this pair on every visit
-- to their network screen.
create index if not exists collaborators_invitee_status_idx
  on collaborators (collaborator_user_id, status)
  where collaborator_user_id is not null;
