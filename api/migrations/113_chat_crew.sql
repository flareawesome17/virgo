-- Chat, phase 3: crew chats.
--
-- A workspace's team chat, a job's crew chat, group admins with a photo and
-- a short About, up to three pinned messages, and notices ("Jo joined") in
-- the thread.
--
-- After 112: the kind list below keeps everything 110 and 112 added. The
-- migrator applies files in name order, so neither can run after this one.
--
-- Additive, apart from the team chats it makes for workspaces that already
-- have a team (below). An older API image ignores every new column; an older
-- app shows a notice as a plain line from whoever it is about.
set local lock_timeout = '5s';

/*
 * Notices: the chat saying who joined, left, was added or removed.
 *
 * A message kind rather than a separate table, so a notice sits in the thread
 * where it happened and pages with everything else. Never pushed, never
 * counted as unread, and nobody can reply to, react to or pin one.
 */
alter table messages
  drop constraint if exists messages_kind_check;
alter table messages
  add constraint messages_kind_check
  check (kind in (
    'text',
    'job-accepted',
    'pay-card',
    'album-photos',
    'booking',
    'job-post',
    'post',
    'package',
    'date-plan',
    'notice'
  ));

/*
 * What a group is for, and how it looks.
 *
 * workspace_id    The workspace whose team chat this is. One per workspace.
 *                 Set null when the workspace is finally purged; the chat
 *                 carries on as an ordinary group under the name it had.
 * hiring_post_id  The job post whose crew chat this is. One per post.
 * photo_url       A photo an admin set, at its public address. Uploaded to
 *                 the admin's own avatars, like a profile picture.
 * about           One short line everyone sees at the top of group info.
 * add_policy      Who can add people: everyone in it, or only admins.
 *                 Ordinary groups keep what they always had; team and crew
 *                 chats are made 'admins'.
 */
alter table conversations
  add column if not exists workspace_id text references workspaces(id) on delete set null,
  add column if not exists hiring_post_id uuid references hiring_posts(id) on delete set null,
  add column if not exists photo_url text,
  add column if not exists about text,
  add column if not exists add_policy text not null default 'everyone';

alter table conversations drop constraint if exists conversations_add_policy_check;
alter table conversations
  add constraint conversations_add_policy_check check (add_policy in ('everyone', 'admins'));
alter table conversations drop constraint if exists conversations_about_length;
alter table conversations
  add constraint conversations_about_length check (about is null or length(about) <= 200);
alter table conversations drop constraint if exists conversations_photo_url_length;
alter table conversations
  add constraint conversations_photo_url_length check (photo_url is null or length(photo_url) <= 1000);

create unique index if not exists conversations_workspace_key
  on conversations (workspace_id) where workspace_id is not null;
create unique index if not exists conversations_hiring_post_key
  on conversations (hiring_post_id) where hiring_post_id is not null;

/*
 * Admins. Whoever made a group is its admin, and can make others admins.
 * A group whose maker has since left gets its longest-standing member, which
 * is also what happens from now on when the last admin leaves.
 */
alter table conversation_participants
  add column if not exists is_admin boolean not null default false;

update conversation_participants p
   set is_admin = true
  from conversations c
 where c.id = p.conversation_id
   and c.is_group
   and p.user_id = c.created_by
   and not p.is_admin;

update conversation_participants p
   set is_admin = true
  from (
    select distinct on (p2.conversation_id) p2.conversation_id, p2.user_id
      from conversation_participants p2
      join conversations c on c.id = p2.conversation_id and c.is_group
     where not exists (select 1 from conversation_participants a
                        where a.conversation_id = p2.conversation_id and a.is_admin)
     order by p2.conversation_id, p2.joined_at, p2.user_id
  ) eldest
 where p.conversation_id = eldest.conversation_id
   and p.user_id = eldest.user_id;

/*
 * Pinned messages: up to three per chat, the same for everyone in it. On the
 * message itself, since a message is pinned or it is not. pinned_by is who
 * pinned it, for the strip; an account deleted since leaves the pin.
 */
alter table messages
  add column if not exists pinned_at timestamptz,
  add column if not exists pinned_by uuid references users(id) on delete set null;

create index if not exists messages_pinned_idx
  on messages (conversation_id, pinned_at desc)
  where pinned_at is not null;

/*
 * A team chat for every workspace that already has a team: the owner (its
 * admin) and everyone who accepted with a role other than client. Clients are
 * left out; an admin can add one. A workspace in Recently deleted gets none
 * now and none when restored, until somebody joins it again.
 *
 * Each one opens with a notice that says what it is, from the owner. Notices
 * are never unread, so this lights no badge.
 */
with teams as (
  select w.id as workspace_id, w.name, w.user_id as owner_id
    from workspaces w
   where w.deleted_at is null
     and not exists (select 1 from conversations c where c.workspace_id = w.id)
     and exists (select 1 from collaborators c
                  where c.workspace_id = w.id
                    and c.status = 'accepted'
                    and c.role <> 'client'
                    and c.collaborator_user_id is not null
                    and c.collaborator_user_id <> w.user_id)
), made as (
  insert into conversations (is_group, title, created_by, workspace_id, add_policy)
  select true, coalesce(nullif(trim(name), ''), 'Team chat'), owner_id, workspace_id, 'admins'
    from teams
  returning id, workspace_id, created_by, title
), members as (
  insert into conversation_participants (conversation_id, user_id, is_admin)
  select m.id, m.created_by, true from made m
  union
  select m.id, c.collaborator_user_id, false
    from made m
    join collaborators c
      on c.workspace_id = m.workspace_id
     and c.status = 'accepted'
     and c.role <> 'client'
     and c.collaborator_user_id is not null
     and c.collaborator_user_id <> m.created_by
  returning conversation_id
)
insert into messages (conversation_id, sender_id, body, kind, context)
select m.id,
       m.created_by,
       'Team chat for ' || m.title || '. People join and leave it with the workspace.',
       'notice',
       jsonb_build_object('event', 'team-chat', 'workspaceId', m.workspace_id)
  from made m;
