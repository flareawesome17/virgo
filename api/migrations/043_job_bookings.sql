-- What was actually agreed.
--
-- Accepting an application connected two people and opened a chat, and that
-- was the whole of it: nothing recorded the role, the day, the rate, or what
-- was included. Every one of those lived in a conversation, where the two
-- sides can remember it differently and neither can show the other anything.
--
-- This is not a contract. There is no signature and no legal weight. What it
-- gives is narrower and more useful: terms neither person can change quietly,
-- because any edit clears both confirmations and the other side has to agree
-- again.
create table if not exists job_bookings (
  id             uuid primary key default gen_random_uuid(),
  -- One booking per accepted application, enforced here rather than in code.
  application_id uuid not null unique
                   references hiring_applications(id) on delete cascade,
  post_id        uuid not null references hiring_posts(id) on delete cascade,
  poster_id      uuid not null references users(id) on delete cascade,
  creative_id    uuid not null references users(id) on delete cascade,

  -- Copied from the post at acceptance, then editable. A booking is what the
  -- two of them settled on, which is not always what the advert said.
  role        text,
  event_date  date,
  location    text,
  rate_minor  integer check (rate_minor is null or rate_minor >= 0),
  currency    text not null default 'PHP',
  notes       text,

  poster_confirmed_at   timestamptz,
  creative_confirmed_at timestamptz,
  /*
   * Set when the second confirmation lands, cleared by any edit.
   *
   * Its presence is what "agreed" means. Deriving it from the two timestamps
   * would be equivalent today and would stop being so the first time an edit
   * needs to clear the agreement without clearing who had confirmed and when
   * — so it is stored, not computed.
   */
  locked_at   timestamptz,
  -- A booking that fell through is part of the record. Never deleted.
  cancelled_at timestamptz,
  cancelled_by uuid references users(id) on delete set null,
  cancel_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- The two sides are different people. Belt and braces: acceptance already
  -- refuses a self-application, so this can only fire if that ever regresses.
  check (poster_id <> creative_id)
);

create index if not exists job_bookings_poster_idx
  on job_bookings (poster_id, created_at desc);
create index if not exists job_bookings_creative_idx
  on job_bookings (creative_id, created_at desc);
create index if not exists job_bookings_post_idx on job_bookings (post_id);

-- `updated_at` needs the same trigger the other tables use, or it keeps its
-- insert value forever and "when did the terms last change" is unanswerable.
drop trigger if exists job_bookings_set_updated_at on job_bookings;
create trigger job_bookings_set_updated_at
  before update on job_bookings
  for each row execute function set_updated_at();
