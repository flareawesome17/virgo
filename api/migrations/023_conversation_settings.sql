-- Per-person conversation settings.
--
-- Both live on the participant row rather than the conversation: muting and
-- clearing are decisions one member makes about their own view, and putting
-- them on the conversation would apply them to everybody.
alter table conversation_participants
  -- A timestamp, not a boolean, so "mute for 8 hours" needs no scheduled job
  -- to undo it. A far-future value is how "until I turn it back on" is stored.
  add column if not exists muted_until timestamptz,
  -- Everything at or before this is hidden from this member. Deleting a
  -- conversation sets it, which empties the thread for them while leaving it
  -- untouched for everyone else.
  add column if not exists cleared_at timestamptz;
