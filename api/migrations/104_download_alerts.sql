-- When the photographer was told about this month's client downloads.
--
-- On 2026-10-25 a client opened a gallery link and got "Downloads are
-- paused": the photographer's clients had used the month's allowance, and the
-- photographer had heard nothing. They are now told twice a month at most —
-- once when 80% is used, once when downloads pause — and these two stamps are
-- what keeps it to once each.
--
--   download_usage.warned_at  When the "most of it is used" alert went out.
--   download_usage.paused_at  When the "downloads are paused" alert went out.
--                             Set together with warned_at when one download
--                             takes the count from under 80% straight past
--                             the limit, so only the pause is sent.
--
-- Per owner and month, on the row that already holds the month's count, so a
-- new month starts with neither stamp and needs no reset. Claimed with
-- `update ... where <stamp> is null`, so two downloads crossing the line at
-- once still send one alert.
--
-- Additive only. Deploys roll the image back without reversing migrations,
-- and an older image ignores both columns.
set local lock_timeout = '5s';

alter table download_usage
  add column if not exists warned_at timestamptz,
  add column if not exists paused_at timestamptz;
