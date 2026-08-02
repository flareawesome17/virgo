-- Email verification and password reset.

alter table users
  -- Null until the address is proven. Deliberately not a blocker for signing
  -- in: locking people out of an account they just created because a mail was
  -- slow is worse than an unverified address, and the flows that actually
  -- matter can check this column when they need to.
  add column if not exists email_verified_at timestamptz;

-- One table for both purposes rather than two near-identical ones. They have
-- the same shape and the same lifecycle; `purpose` is the only thing that
-- differs, and a single expiry sweep covers both.
create table if not exists auth_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid        not null references users(id) on delete cascade,
  purpose    text        not null check (purpose in ('verify_email', 'reset_password')),
  -- Hashed, exactly like refresh_tokens: a leaked database backup must not
  -- hand over working password-reset links.
  token_hash text        not null unique,
  expires_at timestamptz not null,
  -- Set when redeemed, so a token cannot be replayed. Kept rather than deleted
  -- so "this link was already used" is distinguishable from "never existed".
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists auth_tokens_user_purpose_idx
  on auth_tokens (user_id, purpose);

-- The expiry sweep scans on this.
create index if not exists auth_tokens_expires_at_idx on auth_tokens (expires_at);

-- Existing accounts predate verification. Treating them as verified avoids
-- retroactively marking everyone unverified for an address they have been
-- using all along.
update users set email_verified_at = created_at where email_verified_at is null;
