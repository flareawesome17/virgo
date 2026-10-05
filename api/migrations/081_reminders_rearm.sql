-- A reminder that has fired fires again once it is moved or reopened.
--
-- The sweep claims a reminder by stamping notified_at and only ever picks
-- rows where it is null. Nothing cleared it, so a reminder that had gone off
-- once never pushed again: moving it to tomorrow, or unticking it, left it
-- silent on the web and on every phone without its own local alarm.
--
-- A trigger rather than the service, so every way a time changes is covered,
-- including the shift when the event it belongs to moves.
set local lock_timeout = '5s';

create or replace function reminders_rearm()
returns trigger
language plpgsql
as $$
begin
  if new.reminder_time is distinct from old.reminder_time
     or (old.is_completed and not new.is_completed) then
    new.notified_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists reminders_rearm on reminders;
create trigger reminders_rearm
  before update of reminder_time, is_completed on reminders
  for each row execute function reminders_rearm();
