-- One application per role, not one per post.
--
-- The old rule was `unique (post_id, user_id)`, written before an application
-- said which role it was for. It made sense then: a post was one job, so a
-- second application to it was never a legitimately new one.
--
-- It stopped making sense the moment roles became explicit. A wedding wanting
-- a videographer and an HMUA is two jobs on one post, and somebody who does
-- both got exactly one shot at it — apply as HMUA and the videographer slot is
-- closed to you for good, including after a decline for the other role.
--
-- Still one per role, though. Applying twice as HMUA is a mistake, not
-- enthusiasm, and that was the part worth keeping.
alter table hiring_applications
  drop constraint if exists hiring_applications_post_id_user_id_key;

-- coalesce, not a plain three-column unique: NULLs are distinct in a unique
-- index, so `(post, user, null)` would be allowed twice over. A null role is
-- what applications written before the column existed carry, and duplicating
-- one of those is the same mistake as duplicating a named one.
create unique index if not exists hiring_applications_post_user_role_idx
  on hiring_applications (post_id, user_id, coalesce(role, ''));
