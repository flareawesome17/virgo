-- Turns friends and collaborators into references to real accounts.
--
-- Until now a "friend" was a row of free text (name, email) owned by one user,
-- with no link to the person it described. Sending a request created a row only
-- for the sender, so the recipient never saw it and could not accept — the
-- status column was private bookkeeping. Collaborators had the same shape, so
-- "invite a collaborator" added a label, not an account.

alter table friends
  add column if not exists friend_user_id uuid references users(id) on delete cascade;

-- The two directions of one friendship are two rows. This stops a duplicate
-- request creating a second pair, which would let status drift between them.
create unique index if not exists friends_pair_idx
  on friends (user_id, friend_user_id)
  where friend_user_id is not null;

-- Reading "requests addressed to me" filters on this, so it needs an index of
-- its own — the existing one only covers the owning side.
create index if not exists friends_friend_user_id_idx
  on friends (friend_user_id);

alter table collaborators
  add column if not exists collaborator_user_id uuid references users(id) on delete cascade;

create index if not exists collaborators_collaborator_user_id_idx
  on collaborators (collaborator_user_id);

-- Nullable rather than not-null: rows created before this migration have no
-- account to point at, and deleting someone's existing collaborator list to
-- satisfy a constraint would be worse than carrying them as legacy entries.
-- New rows are required to carry one, enforced in CollaboratorsService.
