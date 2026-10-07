-- Money: who owes you.
--
-- A package is what a client agreed to pay for a job — ₱50,000 for the
-- wedding — and the payments against it are ordinary income entries: the
-- down payment, the balance, paid or still due. What is left is worked out,
-- never stored, so it can't drift from the entries.
--
-- A package can be shared with its client as a statement: a link to a page
-- showing the total, what has been paid, what is due, and how to pay — the
-- creative's own GCash, Maya or bank details and QR code. Virgo never handles
-- the money.
--
-- Additive only. Deploys roll the image back without reversing migrations.
set local lock_timeout = '5s';

create table if not exists money_packages (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users (id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 120),
  client_name  text check (char_length(client_name) <= 120),
  -- What the client agreed to pay in all, in centavos.
  total_minor  integer not null check (total_minor > 0 and total_minor <= 1000000000),
  event_date   date,
  note         text check (char_length(note) <= 1000),
  -- The statement link's credential: null while not shared. Replaced, never
  -- reused, when sharing is turned off and on again.
  share_token  text unique,
  shared_at    timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists money_packages_user_idx
  on money_packages (user_id, created_at desc);

drop trigger if exists money_packages_set_updated_at on money_packages;
create trigger money_packages_set_updated_at
  before update on money_packages
  for each row execute function set_updated_at();

-- A payment toward a package. SET NULL: a paid entry is money that moved,
-- and deleting the package must not take it out of the ledger.
alter table money_entries
  add column if not exists package_id uuid references money_packages (id) on delete set null;

create index if not exists money_entries_package_idx
  on money_entries (package_id)
  where package_id is not null;

-- When the creative was told a payment is due tomorrow, and when that it is
-- overdue: each said once per entry.
alter table money_entries
  add column if not exists due_reminded_at     timestamptz,
  add column if not exists overdue_reminded_at timestamptz;

/*
 * How clients pay this person: GCash, Maya, a bank account. Shown only on the
 * statements they share, and only to whoever they share them with.
 */
create table if not exists money_pay_methods (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references users (id) on delete cascade,
  kind           text not null check (kind in ('gcash', 'maya', 'bank', 'other')),
  -- The bank's name, or what "other" is.
  label          text check (char_length(label) <= 60),
  account_name   text check (char_length(account_name) <= 120),
  account_number text check (char_length(account_number) <= 60),
  position       smallint not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists money_pay_methods_user_idx
  on money_pay_methods (user_id, position, created_at);

drop trigger if exists money_pay_methods_set_updated_at on money_pay_methods;
create trigger money_pay_methods_set_updated_at
  before update on money_pay_methods
  for each row execute function set_updated_at();

-- A payment method's QR code is uploaded the way a receipt is, and kept in
-- the same table and prefix: one image per method. A file held by a method
-- is not loose, so the receipt sweep leaves it alone.
alter table money_receipts
  add column if not exists pay_method_id uuid references money_pay_methods (id) on delete set null;

create unique index if not exists money_receipts_pay_method_key
  on money_receipts (pay_method_id)
  where pay_method_id is not null;
