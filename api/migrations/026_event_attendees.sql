-- Who is invited to an event, and whether they said yes.
--
-- `event_id` is text, not uuid: schedule_events.id is text (the client
-- generates it), and a uuid column would not reference it.
create table if not exists event_attendees (
  id           uuid primary key default gen_random_uuid(),
  event_id     text        not null references schedule_events(id) on delete cascade,
  user_id      uuid        not null references users(id) on delete cascade,
  -- Kept even after the response, so the list can say who asked.
  invited_by   uuid        not null references users(id) on delete cascade,
  status       text        not null default 'pending'
                 check (status in ('pending', 'accepted', 'declined')),
  responded_at timestamptz,
  created_at   timestamptz not null default now(),
  -- One invitation per person per event. Re-inviting updates the row rather
  -- than stacking duplicates in the attendee list.
  unique (event_id, user_id)
);

-- "Who is coming to this event?" runs on every event view.
create index if not exists event_attendees_event_idx on event_attendees (event_id);

-- "What have I been invited to?" is the invitee's side, and is filtered by
-- status, so both columns are in the index.
create index if not exists event_attendees_user_status_idx
  on event_attendees (user_id, status);
