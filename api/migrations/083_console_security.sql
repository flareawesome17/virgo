-- Console security: roles you can define, sessions you can see and end,
-- a record of every sign-in, lockout, and authenticator-app two-factor.
--
-- The console is about to be used by a team rather than one owner, and the
-- 039 design assumed one: four hard-coded roles, no way to see who is signed
-- in where, failed sign-ins in a log file, and a password as the only factor.
set local lock_timeout = '5s';

/*
 * Roles.
 *
 * The four built-in roles keep their permissions in api/src/admin/rbac.ts —
 * `system` rows leave `permissions` empty and the code is the source of truth,
 * so the owner role can never be edited into one that cannot manage roles.
 * Custom roles carry their own list, which may include `<area>.*` to take
 * every permission in an area, present and future.
 */
create table if not exists admin_roles (
  name                text primary key check (name ~ '^[a-z][a-z0-9-]{1,31}$'),
  label               text not null check (char_length(label) between 1 and 40),
  description         text not null default '' check (char_length(description) <= 200),
  permissions         text[] not null default '{}',
  requires_two_factor boolean not null default false,
  system              boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

insert into admin_roles (name, label, description, requires_two_factor, system) values
  ('owner', 'Owner', 'Full access, including creating and removing other console accounts.', true, true),
  ('admin', 'Admin', 'Everything except managing console accounts.', true, true),
  ('support', 'Support', 'Answer tickets and look things up. Cannot disable accounts or change plans.', false, true),
  ('viewer', 'Viewer', 'Read-only. Can see every screen and change nothing.', false, true)
on conflict (name) do nothing;

-- The closed list from 039 becomes a reference to the table. Renaming a
-- custom role carries its members with it; deleting one that still has
-- members is refused.
alter table admin_users drop constraint if exists admin_users_role_check;
alter table admin_users drop constraint if exists admin_users_role_fkey;
alter table admin_users
  add constraint admin_users_role_fkey
  foreign key (role) references admin_roles (name) on update cascade;

/*
 * Two-factor and lockout.
 *
 * The authenticator secret is stored encrypted (AES-256-GCM, key derived from
 * ADMIN_JWT_SECRET), so a copy of the database alone does not yield codes.
 * Recovery codes are stored as SHA-256 digests and removed as they are used.
 * `totp_last_step` refuses a code that has already been accepted once, so one
 * read over a shoulder cannot be replayed inside its 30 seconds.
 */
alter table admin_users
  add column if not exists totp_secret         text,
  add column if not exists totp_pending_secret text,
  add column if not exists totp_enabled_at     timestamptz,
  add column if not exists totp_last_step      bigint,
  add column if not exists recovery_codes      text[] not null default '{}',
  add column if not exists failed_logins       integer not null default 0,
  add column if not exists locked_until        timestamptz;

/*
 * Sessions.
 *
 * A refresh token is rotated on every use, so one signed-in browser leaves a
 * chain of them. The session is the thing a person recognises — "Chrome on
 * the office laptop" — and what they end. Access tokens carry its id, so
 * ending a session stops its access token on the next request, not 30
 * minutes later.
 */
create table if not exists admin_sessions (
  id           uuid primary key default gen_random_uuid(),
  admin_id     uuid not null references admin_users (id) on delete cascade,
  ip           text,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at   timestamptz not null,
  revoked_at   timestamptz
);

create index if not exists admin_sessions_admin_idx
  on admin_sessions (admin_id, last_seen_at desc);

alter table admin_refresh_tokens
  add column if not exists session_id uuid references admin_sessions (id) on delete cascade;

/*
 * Every sign-in attempt, kept apart from the audit log.
 *
 * The audit log records what staff changed. Sign-ins are a different
 * question — "is somebody guessing at this account" — and a bot hammering the
 * form would bury the audit log's real entries. Unknown emails are kept too:
 * a run of them is exactly what an owner wants to see.
 */
create table if not exists admin_login_events (
  id         uuid primary key default gen_random_uuid(),
  admin_id   uuid references admin_users (id) on delete set null,
  email      text not null,
  outcome    text not null check (outcome in
               ('success', 'bad_password', 'bad_code', 'locked', 'disabled', 'unknown')),
  ip         text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists admin_login_events_created_idx
  on admin_login_events (created_at desc);
create index if not exists admin_login_events_admin_idx
  on admin_login_events (admin_id, created_at desc);

-- The audit log is now filtered by who and by what.
create index if not exists admin_audit_log_admin_idx
  on admin_audit_log (admin_id, created_at desc);
create index if not exists admin_audit_log_action_idx
  on admin_audit_log (action, created_at desc);
