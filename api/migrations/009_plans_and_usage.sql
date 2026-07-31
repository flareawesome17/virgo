-- Plan tiers and storage accounting.
--
-- Storage usage cannot be derived from the domain tables: uploads go straight
-- from the device to B2 via presigned URLs, so the API never sees the bytes.
-- The size is recorded when the client confirms an upload (the API does a HEAD
-- against the object at that point, so the number is the real stored size
-- rather than something the client claimed).

alter table users
  add column plan text not null default 'free'
    check (plan in ('free', 'pro'));

create table user_files (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid        not null references users(id) on delete cascade,
  -- Object key in the bucket. Unique so a re-confirmed upload updates rather
  -- than double-counting against the quota.
  key          text        not null unique,
  size_bytes   bigint      not null check (size_bytes >= 0),
  content_type text,
  scope        text,
  created_at   timestamptz not null default now()
);

create index user_files_user_id_idx on user_files(user_id);

-- Deliberately not a cached counter on `users`: a running total drifts the
-- moment any delete path misses an update. Summing an indexed column is cheap
-- at this scale and cannot disagree with the rows it is derived from.
