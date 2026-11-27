-- Background uploads (docs/BACKGROUND_UPLOADS.md): files the phone handed to
-- the system to send, which the server finishes when they land.
--
-- A phone with the native upload module asks for a batch of upload URLs that
-- live a day, hands every file to iOS or Android at once, and may then be
-- closed. Nothing on the phone is left to say "it arrived", so the server
-- keeps a row per handed-over file and a job checks them: a single PUT is
-- HEADed, a file in parts is completed from B2's own list of its parts, and
-- either is then filed in its album exactly as the phone's confirm would.
--
-- Additive. An older API image never reads it; older apps never write it.
set local lock_timeout = '5s';

create table if not exists upload_handoffs (
  -- The object key the server minted. One row per file.
  key            text        primary key,
  -- Who handed it over. Files into somebody else's album are still recorded
  -- as theirs to finish; statObject bills them to the album's owner.
  user_id        uuid        not null references users(id) on delete cascade,
  album_id       text        references albums(id) on delete cascade,
  original_name  text,
  -- The file's modified time as the phone reported it, epoch ms.
  last_modified  bigint,
  content_type   text        not null,
  size_bytes     bigint      not null check (size_bytes > 0),
  -- Set for a file sent in parts.
  upload_id      text,
  part_count     integer     check (part_count is null or part_count > 0),
  created_at     timestamptz not null default now(),
  -- When its URLs stop working. Past this (and a grace period) it is closed.
  expires_at     timestamptz not null,
  -- Set once the file is in its album, or given up on (see outcome).
  finished_at    timestamptz,
  -- Once finished: 'filed' (in its album), 'cancelled' (the person removed
  -- it), 'expired' (its URLs ran out first), 'refused' (over the ceiling, out
  -- of storage, or no longer allowed in the album), 'gone' (its parts were
  -- released before it was assembled).
  outcome        text        check (outcome is null or outcome in ('filed', 'cancelled', 'expired', 'refused', 'gone')),
  -- How often the job has looked, and when last, for its back-off.
  checks         integer     not null default 0,
  checked_at     timestamptz,
  last_error     text
);

-- The job's queue: what is still open, least recently looked at first.
create index if not exists upload_handoffs_open
  on upload_handoffs (checked_at nulls first)
  where finished_at is null;

-- Finished rows are kept a week for support, then removed.
create index if not exists upload_handoffs_finished
  on upload_handoffs (finished_at)
  where finished_at is not null;
