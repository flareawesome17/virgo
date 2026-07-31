-- Profile fields the mobile profile form already collects but had nowhere to
-- store. Without these the screen was a mock: it showed hardcoded values and
-- its Save button only raised an alert.
--
-- All nullable — an account is fully usable before any of them are filled in.

alter table users
  add column title    text,
  add column phone    text,
  add column website  text,
  add column location text,
  add column bio      text;
