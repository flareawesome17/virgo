-- Customer 360: what the console knows about one customer beyond their
-- profile — the devices they are signed in on, notes staff leave about them,
-- tags that group them, and saved views of the people list.
set local lock_timeout = '5s';

/*
 * Devices: the kind of device each app session signed in from.
 *
 * A refresh token is rotated on every use, so one signed-in phone leaves a
 * chain of them; `family_id` ties the chain together, so the console can show
 * "iPhone app, signed in 3 weeks ago" as one row and sign that one out. Only
 * the User-Agent is kept — never the IP address, as the privacy policy says.
 * Tokens issued before this have no family; each counts as its own.
 */
alter table refresh_tokens
  add column if not exists family_id  uuid,
  add column if not exists user_agent text;

create index if not exists refresh_tokens_family_idx
  on refresh_tokens (family_id)
  where family_id is not null;

/*
 * Notes staff leave on a customer: "called about the zip download, sent a
 * fresh link". Internal — nothing here is ever shown to the customer. The
 * author's name is copied so a note outlives the console account that wrote it.
 */
create table if not exists customer_notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users (id) on delete cascade,
  admin_id   uuid references admin_users (id) on delete set null,
  admin_name text not null,
  body       text not null check (char_length(body) between 1 and 4000),
  pinned     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_notes_user_idx
  on customer_notes (user_id, pinned desc, created_at desc);

/*
 * Tags: a small shared vocabulary staff put on customers — "VIP", "beta",
 * "wedding studio" — to find them again and, later, to message them as a
 * group. Labels are unique ignoring case so there is one "VIP", not three.
 */
create table if not exists customer_tags (
  id         uuid primary key default gen_random_uuid(),
  label      text not null check (char_length(label) between 1 and 32),
  color      text not null default 'neutral'
               check (color in ('neutral', 'terracotta', 'green', 'amber', 'red', 'blue', 'violet')),
  created_by uuid references admin_users (id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists customer_tags_label_key
  on customer_tags (lower(label));

create table if not exists customer_tag_links (
  user_id    uuid not null references users (id) on delete cascade,
  tag_id     uuid not null references customer_tags (id) on delete cascade,
  added_by   uuid references admin_users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, tag_id)
);

create index if not exists customer_tag_links_tag_idx
  on customer_tag_links (tag_id);

/*
 * Saved views of a list: a name and the filters behind it. Private to whoever
 * saved it unless shared with every staff member.
 */
create table if not exists admin_saved_views (
  id         uuid primary key default gen_random_uuid(),
  admin_id   uuid not null references admin_users (id) on delete cascade,
  scope      text not null check (scope in ('users')),
  name       text not null check (char_length(name) between 1 and 60),
  query      jsonb not null default '{}'::jsonb,
  shared     boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists admin_saved_views_scope_idx
  on admin_saved_views (scope, admin_id);
