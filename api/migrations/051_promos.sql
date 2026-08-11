-- Promos: admin-defined rewards, handed out and claimed in the app.
--
-- One concept covers both cases the product needs. A *targeted* promo is
-- offered to a list of accounts the admin picks. A *referral* promo pays the
-- referrer when somebody they invited confirms their address. They differ in
-- how a grant comes to exist, not in what it does, so they share a table
-- rather than diverging into two features that drift apart.

create table if not exists promos (
  id uuid primary key default gen_random_uuid(),
  -- Admin-facing. Also what the recipient sees, so it should read as an offer
  -- rather than an internal code: "Beta storage boost", not "PROMO_2026Q3".
  name text not null,
  description text,
  kind text not null check (kind in ('targeted', 'referral')),

  -- The reward. Any combination, and the service refuses a promo that grants
  -- nothing at all — an offer worth zero is a support ticket waiting to happen.
  --
  -- These mirror PlanLimits exactly (storageBytes / workspaces /
  -- albumsPerWorkspace) so applying one is addition, not translation.
  storage_bytes bigint not null default 0 check (storage_bytes >= 0),
  extra_workspaces integer not null default 0 check (extra_workspaces >= 0),
  extra_albums_per_workspace integer not null default 0
    check (extra_albums_per_workspace >= 0),

  -- How long a *new* grant stays claimable. Null means it does not expire.
  -- Stored as a duration rather than a date so a promo that runs for months
  -- still gives each recipient the same window to notice it.
  claim_window_days integer check (claim_window_days is null or claim_window_days > 0),

  -- Switching this off stops new grants. It deliberately does NOT revoke
  -- rewards already claimed: taking back storage somebody is using would
  -- delete their work, which no admin toggle should be able to do by accident.
  active boolean not null default true,

  created_by uuid references admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A promo offered to one account, and whether they took it.
create table if not exists promo_grants (
  id uuid primary key default gen_random_uuid(),
  promo_id uuid not null references promos(id) on delete cascade,
  -- Who gets the reward. For a referral this is the referrer, never the
  -- person who signed up.
  user_id uuid not null references users(id) on delete cascade,

  -- Null until claimed. Presence is what makes the reward count.
  claimed_at timestamptz,

  -- Copied from the promo when the grant is made, not read through at claim
  -- time: editing a promo later must not silently revive grants that already
  -- lapsed, nor cut short ones already offered.
  expires_at timestamptz,

  -- Which signup earned this, for a referral grant. Null on a targeted one.
  -- Kept so a grant can be explained after the fact — "you earned this when
  -- Mika joined" is a better notification than "you earned a reward".
  referred_user_id uuid references users(id) on delete set null,

  created_at timestamptz not null default now()
);

-- One targeted grant per person per promo. Selecting the same user twice in
-- the console is a slip, not an instruction to pay them twice.
create unique index if not exists promo_grants_targeted_key
  on promo_grants (promo_id, user_id)
  where referred_user_id is null;

-- One referral grant per referred account, ever. Without this a referee who
-- deleted and re-made their account would pay the referrer again, which is
-- the cheapest way to farm this.
create unique index if not exists promo_grants_referral_key
  on promo_grants (promo_id, referred_user_id)
  where referred_user_id is not null;

-- The read on the hot path: every quota check sums this user's claimed grants.
create index if not exists promo_grants_user_idx
  on promo_grants (user_id)
  where claimed_at is not null;

-- The other read: "what am I being offered?", on sign-in.
create index if not exists promo_grants_unclaimed_idx
  on promo_grants (user_id)
  where claimed_at is null;

-- The code somebody shares to earn referrals.
--
-- On the user rather than in its own table: it is one immutable value per
-- account, generated on demand, and a join to fetch it would buy nothing.
alter table users
  add column if not exists referral_code text,
  -- Who invited this account. Recorded at signup and read once, when the
  -- address is confirmed — an unverified signup must never pay out, or the
  -- referral is farmable with addresses nobody owns.
  add column if not exists referred_by_user_id uuid references users(id) on delete set null;

create unique index if not exists users_referral_code_key
  on users (referral_code)
  where referral_code is not null;

comment on column users.referred_by_user_id is
  'Set at signup from a referral code. Pays out only once email_verified_at is set.';
