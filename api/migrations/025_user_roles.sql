-- What someone does on a shoot.
--
-- An array, not a single column: people genuinely hold several of these at
-- once — a photographer who also does the SDE edit is the normal case, not an
-- edge one — so a one-of choice would force them to misrepresent themselves.
--
-- Distinct from `collaborators.role`, which is permission on one workspace.
-- This is a profession, and it travels with the person: it is what makes
-- "find a video editor near me" answerable.
alter table users
  add column if not exists roles text[] not null default '{}';

-- Discovery filters on these, and `&&` (overlaps) needs a GIN index to avoid
-- scanning every user.
create index if not exists users_roles_idx on users using gin (roles);

-- Accounts predating this have none. Left empty rather than guessed at — an
-- invented role is worse than a blank one, and the profile screen prompts for
-- it.
