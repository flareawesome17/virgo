-- Money: each person's own record of what came in and what went out.
--
-- A creative's ledger, kept by hand: the fee for a shoot, the pamasahe to
-- get there, the second shooter they paid. Strictly personal. Nothing here is
-- shared through a workspace or shown to the other side of a booking, and the
-- console does not read it.
--
-- Additive only. Deploys roll the image back without reversing migrations, so
-- nothing older may depend on these tables.
set local lock_timeout = '5s';

create table if not exists money_entries (
  -- Made on the phone before the first attempt, so a save retried after a
  -- response that never arrived — or sent from the offline queue — finds the
  -- row it already wrote instead of writing a second one.
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references users (id) on delete cascade,
  kind           text not null check (kind in ('income', 'expense')),
  -- Centavos, like every other money column. For income this is the gross:
  -- what the client was billed, before any tax they withheld. Up to
  -- ₱10,000,000, which only catches a typo.
  amount_minor   integer not null check (amount_minor > 0 and amount_minor <= 1000000000),
  -- What a client kept back as creditable withholding tax (BIR Form 2307).
  -- Recorded apart from the gross, because what lands in GCash is the net and
  -- a ledger of nets understates income and loses the credit.
  withheld_minor integer not null default 0 check (withheld_minor >= 0),
  currency       text not null default 'PHP',
  -- A slug from the apps' list for the kind (money.categories.ts). Checked
  -- there rather than here so the list can grow without a migration.
  category       text not null check (char_length(category) between 1 and 32),
  -- What the entry is about: the shoot, the purchase — or, unpaid, the day
  -- the money is due.
  occurred_on    date not null,
  -- When the money actually moved. Null is outstanding: a client who still
  -- owes, or a bill not paid yet.
  paid_on        date,
  method         text check (method in ('gcash', 'maya', 'bank', 'cash', 'card', 'other')),
  -- A GCash or bank reference number, an invoice number.
  reference      text check (char_length(reference) <= 80),
  -- Who paid, or who was paid. A name as typed, not an account: most clients
  -- are not on Virgo.
  counterparty   text check (char_length(counterparty) <= 120),
  note           text check (char_length(note) <= 1000),
  -- The day it is listed under: when it was paid, or until then when it is
  -- due. Months and exports are cut on this.
  filed_on       date generated always as (coalesce(paid_on, occurred_on)) stored,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- Only a client withholds, and never more than the fee.
  constraint money_entries_withheld_check
    check (withheld_minor <= amount_minor and (kind = 'income' or withheld_minor = 0))
);

create index if not exists money_entries_user_filed_idx
  on money_entries (user_id, filed_on desc, created_at desc);
create index if not exists money_entries_unpaid_idx
  on money_entries (user_id, occurred_on)
  where paid_on is null;

drop trigger if exists money_entries_set_updated_at on money_entries;
create trigger money_entries_set_updated_at
  before update on money_entries
  for each row execute function set_updated_at();

comment on column money_entries.filed_on is
  'coalesce(paid_on, occurred_on): the day an entry is listed and exported under.';

/*
 * A photo or PDF of the receipt, one per entry, in the private bucket under
 * `receipts/`, outside every user's prefix.
 *
 * Not `user_files`: a receipt is not part of anyone's library, so it never
 * counts against their storage or shows up among their files. The row is
 * written when the upload is signed and is loose (entry_id null) until an
 * entry is saved with it. A loose row a day old is swept with its object —
 * which also takes care of a receipt replaced on an entry, an entry deleted,
 * and, through user_id's set null, an account that has gone.
 */
create table if not exists money_receipts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references users (id) on delete set null,
  entry_id     uuid references money_entries (id) on delete set null,
  key          text not null unique,
  name         text not null,
  content_type text not null,
  size_bytes   bigint not null,
  created_at   timestamptz not null default now(),
  attached_at  timestamptz
);

create unique index if not exists money_receipts_entry_key
  on money_receipts (entry_id)
  where entry_id is not null;
create index if not exists money_receipts_loose_idx
  on money_receipts (created_at)
  where entry_id is null;
create index if not exists money_receipts_user_idx
  on money_receipts (user_id)
  where user_id is not null;
