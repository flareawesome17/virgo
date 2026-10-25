-- Sign-in alerts, and which Virgo app each session is.
--
-- On 2026-10-25 somebody signed in to an account with its password and
-- deleted a workspace two minutes later. Nothing told the owner, and the only
-- way to end that session was the console. Two things change that: the owner
-- is emailed when a new device signs in, with a link that signs it straight
-- out, and Settings lists every signed-in device with a Sign out for each.
--
--   refresh_tokens.client  Which Virgo client the session signed in from:
--                          'ios' or 'android' (the phone app), 'desktop' (the
--                          Windows or Mac app), 'web' (a browser). Worked out
--                          from the User-Agent and the request's Origin, since
--                          the desktop app's webview reads exactly like Edge.
--                          Carried over on refresh; null until a session made
--                          before this refreshes once.
--
--   sign_in_alerts         One row per alert email. `token_hash` is the link's
--                          secret, hashed like every other token here; the
--                          link only ever signs that one session out and asks
--                          for a password reset, so it is safe to hold in an
--                          inbox. `family_id` is the session it is about
--                          (refresh_tokens.family_id). `used_at` stops a
--                          second click doing it twice.
--
-- Additive only. Deploys roll the image back without reversing migrations,
-- and an older image ignores both.
set local lock_timeout = '5s';

alter table refresh_tokens
  add column if not exists client text
  check (client is null or client in ('ios', 'android', 'desktop', 'web'));

create table if not exists sign_in_alerts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users (id) on delete cascade,
  family_id   uuid not null,
  token_hash  text not null unique,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz
);

create index if not exists sign_in_alerts_user_idx
  on sign_in_alerts (user_id, created_at desc);
