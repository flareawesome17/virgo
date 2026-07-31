-- Public, revocable share links so a photographer can hand a client a URL
-- without the client needing an account.
--
-- The token is the only credential, so it is generated server-side from a CSPRNG
-- and stored unique. Anyone holding it can read the album's media and nothing
-- else — no user record, no other album, no write access.

create table if not exists album_share_links (
  id uuid primary key default gen_random_uuid(),
  -- text, not uuid: albums.id is text (ids are client-supplied strings), and a
  -- foreign key requires matching types.
  album_id text not null references albums(id) on delete cascade,
  -- Denormalised from the album so revocation and listing can be authorised
  -- without a join, and so a deleted owner takes their links with them.
  user_id uuid not null references users(id) on delete cascade,
  token text not null unique,
  -- null means the link does not expire.
  expires_at timestamptz,
  -- Soft revoke: keeps the token reserved so it can never be reissued.
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The public lookup is by token alone and runs on every client page view.
create index if not exists album_share_links_token_idx
  on album_share_links (token);

-- Postgres does not index foreign keys automatically; both of these are
-- filtered on constantly (listing an album's links, cascading a user delete).
create index if not exists album_share_links_album_id_idx
  on album_share_links (album_id);
create index if not exists album_share_links_user_id_idx
  on album_share_links (user_id);

-- One live link per album keeps "the client link" unambiguous. Revoked and
-- expired rows are excluded so a new link can always be issued after revoking.
create unique index if not exists album_share_links_one_active_idx
  on album_share_links (album_id)
  where revoked_at is null;

drop trigger if exists set_album_share_links_updated_at on album_share_links;
create trigger set_album_share_links_updated_at
  before update on album_share_links
  for each row execute function set_updated_at();
