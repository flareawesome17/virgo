-- Moderation: reports get a review state, chat reports carry what was said,
-- and every decision is written down against the person it was about.

/*
 * Review state, the same on all three kinds of report.
 *
 * open      waiting for somebody to look
 * actioned  something was done: the post hidden, the person warned or suspended
 * dismissed looked at, and nothing was wrong
 *
 * A decision closes every open report on its target at once, so one person
 * reported by five gets one decision, not five.
 */
alter table user_reports
  add column if not exists status          text not null default 'open'
    check (status in ('open', 'actioned', 'dismissed')),
  add column if not exists resolution      text
    check (resolution is null or resolution in ('dismissed', 'hidden', 'warned', 'suspended')),
  add column if not exists resolved_by     uuid references admin_users (id) on delete set null,
  add column if not exists resolved_at     timestamptz,
  add column if not exists resolution_note text;

alter table hiring_post_reports
  add column if not exists status          text not null default 'open'
    check (status in ('open', 'actioned', 'dismissed')),
  add column if not exists resolution      text
    check (resolution is null or resolution in ('dismissed', 'hidden', 'warned', 'suspended')),
  add column if not exists resolved_by     uuid references admin_users (id) on delete set null,
  add column if not exists resolved_at     timestamptz,
  add column if not exists resolution_note text;

alter table showcase_reports
  add column if not exists status          text not null default 'open'
    check (status in ('open', 'actioned', 'dismissed')),
  add column if not exists resolution      text
    check (resolution is null or resolution in ('dismissed', 'hidden', 'warned', 'suspended')),
  add column if not exists resolved_by     uuid references admin_users (id) on delete set null,
  add column if not exists resolved_at     timestamptz,
  add column if not exists resolution_note text;

/*
 * One *open* report per reporter per target, where it was one ever.
 *
 * Once a report could be closed, "one ever" meant somebody harassed again
 * after their first report was dismissed could never be heard a second time:
 * the insert met the old row and quietly did nothing.
 */
alter table user_reports drop constraint if exists user_reports_once;
create unique index if not exists user_reports_open_once
  on user_reports (reporter_id, target_id) where status = 'open';

alter table hiring_post_reports
  drop constraint if exists hiring_post_reports_post_id_reporter_user_id_key;
create unique index if not exists hiring_post_reports_open_once
  on hiring_post_reports (post_id, reporter_user_id) where status = 'open';

alter table showcase_reports drop constraint if exists showcase_reports_once;
create unique index if not exists showcase_reports_open_once
  on showcase_reports (reporter_id, showcase_id) where status = 'open';

-- The queue: what is still open, by target.
create index if not exists user_reports_open_idx
  on user_reports (target_id) where status = 'open';
create index if not exists hiring_post_reports_open_idx
  on hiring_post_reports (post_id) where status = 'open';
create index if not exists showcase_reports_open_idx
  on showcase_reports (showcase_id) where status = 'open';

/*
 * What a chat report is about, copied when it was filed.
 *
 * Staff never read a conversation. When somebody reports a person from a
 * chat, the app sends the ids of the latest messages they could see, and the
 * API copies those — only those between the two of them — here. The copy is
 * what the console shows, and it stays as it was: deleting or editing the
 * original later changes nothing here, which is what makes it evidence.
 */
create table if not exists report_evidence (
  id              uuid primary key default gen_random_uuid(),
  report_id       uuid not null references user_reports (id) on delete cascade,
  -- No foreign keys on these: the snapshot outlives the message and the chat.
  message_id      uuid not null,
  conversation_id uuid not null,
  sender_id       uuid,
  sender_role     text not null check (sender_role in ('reporter', 'reported')),
  sender_name     text not null,
  body            text not null,
  kind            text not null default 'text',
  sent_at         timestamptz not null,
  captured_at     timestamptz not null default now(),
  unique (report_id, message_id)
);

create index if not exists report_evidence_report_idx
  on report_evidence (report_id, sent_at);

/*
 * Every moderation decision, against the person it was about.
 *
 * The strikes a repeat offender has, the history on their account page, and
 * the record of what a removed comment said. Goes with the account.
 */
create table if not exists moderation_actions (
  id              uuid primary key default gen_random_uuid(),
  subject_user_id uuid references users (id) on delete cascade,
  action          text not null
    check (action in ('dismiss', 'hide', 'warn', 'suspend', 'remove_comment')),
  target_type     text not null check (target_type in ('user', 'job', 'showcase', 'comment')),
  target_id       uuid not null,
  -- The post's title or the person's name as it was, for the history.
  target_label    text,
  -- How many open reports the decision closed.
  reports         integer not null default 0,
  -- What the person was told, when they were warned.
  message         text,
  -- For staff only.
  note            text,
  -- A removed comment's words, kept because the comment is gone.
  snapshot        jsonb,
  ticket_id       uuid references support_tickets (id) on delete set null,
  admin_id        uuid references admin_users (id) on delete set null,
  admin_name      text,
  created_at      timestamptz not null default now()
);

create index if not exists moderation_actions_subject_idx
  on moderation_actions (subject_user_id, created_at desc);

/*
 * A warning reaches the person as a message from the safety team in their
 * support inbox, so they can answer it. Those tickets are opened by staff,
 * which the desk's speed numbers leave out: a first reply in no seconds is
 * not a first reply.
 */
alter table support_tickets
  add column if not exists origin text not null default 'customer'
    check (origin in ('customer', 'staff'));

alter table support_tickets drop constraint if exists support_tickets_category_check;
alter table support_tickets add constraint support_tickets_category_check
  check (category is null or category in
    ('account', 'billing', 'uploads', 'sharing', 'bookings', 'bug', 'feedback', 'safety', 'other'));
