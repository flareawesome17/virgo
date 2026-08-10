-- The management console: its own accounts, its own sessions, its own audit.
--
-- Deliberately not a flag on `users`. A Virgo account is a photographer's
-- account — it is handed to a phone, kept signed in for months, and recovered
-- by email. Attaching the ability to disable other people's accounts and read
-- their storage to that same credential means one stolen session on one device
-- reaches the whole platform. These tables share nothing with app auth: not the
-- table, not the token, not the JWT audience.

create table if not exists admin_users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  password_hash text not null,
  name          text not null,
  -- See ADMIN_ROLES in api/src/admin/rbac.ts. A closed list, checked here as
  -- well as in code, because the database is the last place a bad value can be
  -- stopped before it becomes an authorisation decision.
  role          text not null default 'viewer'
                  check (role in ('owner', 'admin', 'support', 'viewer')),
  disabled_at   timestamptz,
  last_login_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Case-insensitive, matching how the app's users table treats email: nobody
-- should be able to register Ernie@ alongside ernie@.
create unique index if not exists admin_users_email_key
  on admin_users (lower(email));

-- At least one owner must exist, or the console locks itself out. Enforced in
-- the service rather than here, because a partial unique index cannot express
-- "at least one" — but stated here so the next reader knows the rule exists.

create table if not exists admin_refresh_tokens (
  id         uuid primary key default gen_random_uuid(),
  admin_id   uuid not null references admin_users(id) on delete cascade,
  -- The token itself is never stored. A leaked database backup would otherwise
  -- hand over live sessions.
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists admin_refresh_tokens_admin_idx
  on admin_refresh_tokens (admin_id, created_at desc);

/*
 * Who did what to whom.
 *
 * A management console can disable accounts, change plans and revoke client
 * links. Without a record, "who took this album down" has no answer, and an
 * admin acting badly is indistinguishable from a bug. Append-only by
 * convention — nothing in the API updates or deletes a row here.
 */
create table if not exists admin_audit_log (
  id          uuid primary key default gen_random_uuid(),
  admin_id    uuid references admin_users(id) on delete set null,
  admin_email text not null,
  action      text not null,
  target_type text,
  target_id   text,
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists admin_audit_log_created_idx
  on admin_audit_log (created_at desc);
create index if not exists admin_audit_log_target_idx
  on admin_audit_log (target_type, target_id);

/*
 * Site visits, counted here rather than by a third party.
 *
 * The console has to answer "how many people came to virgo.ph", and shipping
 * that to an analytics vendor was declined. It also could not have been done
 * naively: client delivery lives at client.virgo.ph/s/<token> where the token
 * IS the credential, so a table of visited URLs would be a table of live
 * gallery passwords.
 *
 * So: `path` is normalised before insert (see VisitsService) and a share link
 * is only ever recorded as '/s'. No IP address and no user agent is stored —
 * `visitor_hash` is a daily-salted digest, which counts a returning visitor
 * within a day and becomes meaningless the next, so this cannot be turned back
 * into a person's browsing history.
 */
create table if not exists site_visits (
  id           bigserial primary key,
  host         text not null,
  path         text not null,
  referrer_host text,
  visitor_hash text not null,
  created_at   timestamptz not null default now()
);

create index if not exists site_visits_created_idx on site_visits (created_at desc);
create index if not exists site_visits_host_created_idx on site_visits (host, created_at desc);
-- Counting distinct visitors per day is the most common query on this table.
create index if not exists site_visits_visitor_idx on site_visits (visitor_hash, created_at desc);

/*
 * Customer support.
 *
 * A ticket belongs to a Virgo account, not to an email address: the person
 * writing in is already authenticated in the app, so there is no need to
 * accept unverified contact details and no inbox to spam. Support staff answer
 * from the console; the user sees the thread in the app.
 *
 * `user_id` survives account deletion as null rather than cascading. A ticket
 * is a record of a conversation the business had — deleting the person should
 * not erase the fact that a complaint was made or how it was handled.
 */
create table if not exists support_tickets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references users(id) on delete set null,
  user_email  text not null,
  subject     text not null,
  status      text not null default 'open'
                check (status in ('open', 'pending', 'resolved', 'closed')),
  priority    text not null default 'normal'
                check (priority in ('low', 'normal', 'high', 'urgent')),
  assigned_to uuid references admin_users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Set when an admin first replies, so first-response time is measurable
  -- rather than guessed at.
  first_replied_at timestamptz,
  resolved_at timestamptz
);

create index if not exists support_tickets_status_idx
  on support_tickets (status, updated_at desc);
create index if not exists support_tickets_user_idx
  on support_tickets (user_id, created_at desc);

create table if not exists support_messages (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references support_tickets(id) on delete cascade,
  -- Which side wrote it. Not derived from whether admin_id is null, because an
  -- admin whose account is later deleted would silently become "the customer".
  author_type text not null check (author_type in ('user', 'admin')),
  author_id   uuid,
  author_name text not null,
  body        text not null,
  -- An admin-only note on the thread: visible in the console, never sent to
  -- the customer. Kept in the same table so the timeline reads in order.
  internal    boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists support_messages_ticket_idx
  on support_messages (ticket_id, created_at);
