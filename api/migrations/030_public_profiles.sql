-- Public profiles: a claimed handle, and an opt-in to being on the open web.

-- The handle is the whole address: virgo.ph/@mika.
--
-- Nullable, because it is claimed rather than assigned — an account that never
-- publishes never needs one, and forcing a generated handle on thirteen
-- existing users would put a name on the web that none of them chose.
alter table users
  add column if not exists handle text;

-- Unique on lower(handle) rather than a citext column: one fewer extension to
-- install, and the comparison rule stays visible to anyone reading the schema.
-- @Mika and @mika are the same person's address; they must not be two accounts.
create unique index if not exists users_handle_key on users (lower(handle));

-- When it was last changed, so a rename can be rate-limited. Renaming breaks
-- every link anybody has shared, so it should not be casual.
alter table users
  add column if not exists handle_changed_at timestamptz;

-- Off for everybody, including every account that already exists.
--
-- Deliberately separate from `discoverable`, which gates in-app people search.
-- Being findable by name inside the product and being a page Google can read
-- are different decisions, and somebody may reasonably want one and not the
-- other.
alter table users
  add column if not exists public_profile boolean not null default false;

-- The lookup on every profile page view: handle -> published account.
-- Partial, because unpublished rows are never the answer to that question.
create index if not exists users_public_profile_idx
  on users (lower(handle))
  where public_profile = true;
