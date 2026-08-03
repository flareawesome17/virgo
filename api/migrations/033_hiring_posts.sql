-- "I need a photographer on the 19th."
--
-- Hire enquiries are pull-based and one-to-one: you have to already know who
-- you want. That fails at exactly the moment hiring is hard — you do not know
-- who is free that weekend, you want to compare three people, or one event
-- needs a photographer *and* a videographer *and* an HMUA. A post inverts it:
-- describe the job once, let the people who can do it come to you.

create table if not exists hiring_posts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid        not null references users(id) on delete cascade,

  -- The public address. Kept in its own column rather than derived from the
  -- title, because a title can be edited and a URL that has been shared,
  -- indexed and linked cannot.
  slug         text        not null unique,

  title        text        not null,
  description  text        not null,

  -- The same closed list as users.roles, so a post is findable by exactly the
  -- people who can do it and Nearby's filters mean the same thing here.
  roles_wanted text[]      not null default '{}',

  event_date   date,
  -- Free-text city, matching how profiles store it. Never coordinates: a job
  -- post is public, and "where the shoot is" is not "where the poster lives".
  location     text,

  -- Centavos, like billing. An integer cannot drift the way a float can, and
  -- ₱25,000.50 is not a rate anybody quotes.
  budget_min   integer     check (budget_min is null or budget_min >= 0),
  budget_max   integer     check (budget_max is null or budget_max >= 0),
  constraint hiring_posts_budget_order
    check (budget_min is null or budget_max is null or budget_min <= budget_max),

  status       text        not null default 'open'
                 check (status in ('open', 'filled', 'closed', 'expired')),

  -- Moderation takedown. Nullable rather than a status, because a hidden post
  -- is still 'open' to its owner — it has been removed from public view, not
  -- closed on their behalf.
  hidden_at    timestamptz,

  -- Not optional, and not a nicety: a board full of six-month-old posts is
  -- worse than no board. A sweep closes anything past this or past its date.
  expires_at   timestamptz not null default now() + interval '30 days',

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- The board itself: open, not hidden, not expired, newest first.
create index if not exists hiring_posts_board_idx
  on hiring_posts (created_at desc)
  where status = 'open' and hidden_at is null;

-- Overlap search, the same operator and index type Nearby uses on users.roles,
-- so "photographers within 25km" and "posts wanting a photographer" are the
-- same question asked from opposite ends.
create index if not exists hiring_posts_roles_idx
  on hiring_posts using gin (roles_wanted);

create index if not exists hiring_posts_user_idx
  on hiring_posts (user_id, created_at desc);

-- What the sweep scans.
create index if not exists hiring_posts_expiry_idx
  on hiring_posts (expires_at) where status = 'open';

drop trigger if exists hiring_posts_set_updated_at on hiring_posts;
create trigger hiring_posts_set_updated_at
  before update on hiring_posts
  for each row execute function set_updated_at();


create table if not exists hiring_applications (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid        not null references hiring_posts(id) on delete cascade,
  user_id      uuid        not null references users(id) on delete cascade,
  message      text        not null,
  status       text        not null default 'new'
                 check (status in ('new', 'shortlisted', 'accepted', 'declined')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,

  -- Applying twice to the same job is a mistake, not enthusiasm. Unlike hire
  -- enquiries this is unconditional: a post is one job, so a second
  -- application to it is never a legitimately new one.
  unique (post_id, user_id)
);

create index if not exists hiring_applications_post_idx
  on hiring_applications (post_id, created_at desc);
create index if not exists hiring_applications_user_idx
  on hiring_applications (user_id, created_at desc);


-- Posts are the first thing on Virgo that is public, user-authored, and not
-- anchored to a portfolio — which makes this the first surface that needs a
-- way to say "this should not be here".
create table if not exists hiring_post_reports (
  id               uuid primary key default gen_random_uuid(),
  post_id          uuid        not null references hiring_posts(id) on delete cascade,
  reporter_user_id uuid        not null references users(id) on delete cascade,
  reason           text        not null,
  note             text,
  created_at       timestamptz not null default now(),
  -- One report per person per post: a second is not more signal.
  unique (post_id, reporter_user_id)
);

create index if not exists hiring_post_reports_post_idx
  on hiring_post_reports (post_id);
