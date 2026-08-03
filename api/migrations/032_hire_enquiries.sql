-- "I want to hire you for this."
--
-- The first contact between two people who are not connected yet. A friend
-- request cannot carry a brief, a date, or a rate, so a hirer who found someone
-- on a public profile had no way to say what the job actually was.

create table if not exists hire_enquiries (
  id            uuid primary key default gen_random_uuid(),
  from_user_id  uuid        not null references users(id) on delete cascade,
  to_user_id    uuid        not null references users(id) on delete cascade,
  -- Which of the recipient's roles this is about, when the sender said.
  role_wanted   text,
  event_date    date,
  message       text        not null,
  budget        text,
  status        text        not null default 'new'
                  check (status in ('new', 'accepted', 'declined')),
  created_at    timestamptz not null default now(),
  responded_at  timestamptz,
  constraint hire_enquiries_not_self check (from_user_id <> to_user_id)
);

-- Both inboxes: what was sent to me, and what I have sent.
create index if not exists hire_enquiries_to_idx
  on hire_enquiries (to_user_id, created_at desc);
create index if not exists hire_enquiries_from_idx
  on hire_enquiries (from_user_id, created_at desc);

-- One open enquiry per pair. Not a general uniqueness rule — once answered, a
-- second job next year is a legitimate new enquiry. This only stops the same
-- unanswered message arriving five times.
create unique index if not exists hire_enquiries_one_open_idx
  on hire_enquiries (from_user_id, to_user_id)
  where status = 'new';
