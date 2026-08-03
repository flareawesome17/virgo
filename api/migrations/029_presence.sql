-- When each account was last connected.
--
-- Online/offline itself is in memory in the realtime gateway — it is a fact
-- about open sockets, and a row in Postgres would go stale the moment the
-- process died. This is the other half: once somebody *is* offline, "last seen
-- 20 minutes ago" is the only useful thing left to say, and that has to
-- survive a restart.
--
-- Written on connect and on disconnect, so it is accurate for anyone offline
-- and merely recent for anyone online.
alter table users
  add column if not exists last_seen_at timestamptz;

-- Defaulted, so an account that has never opened a socket still has a sensible
-- answer. Without it a brand-new user renders as "never seen" — which is both
-- wrong and the first thing anyone who just signed up would see about
-- themselves in a conversation.
alter table users
  alter column last_seen_at set default now();

-- Backfilled from account creation rather than left null: a null would render
-- as "never seen", which is wrong for every existing account.
update users set last_seen_at = created_at where last_seen_at is null;

-- "Who in this conversation is online" is answered from memory, but "when was
-- this person last around" is a lookup per participant on every thread open.
create index if not exists users_last_seen_idx on users (last_seen_at desc);
