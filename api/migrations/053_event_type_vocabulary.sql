-- The calendar only knew how to describe a photographer's week.
--
-- `shoot` was the default and the first option, which reads as an assumption
-- about what the account does for a living. Virgo is used by videographers,
-- editors, retouchers and studio managers, and "Shoot" is the wrong word for
-- most of what they put on a calendar. It becomes `event` — the neutral word,
-- and still the default.
--
-- The other four stay. `editing`, `review`, `delivery` and `meeting` describe
-- stages of work rather than a trade, and renaming them would churn the UI for
-- nothing.
--
-- And because a fixed list of five will never fit everybody, `other` is added
-- alongside a free-text label. The vocabulary stays closed — colours, icons and
-- filters all key off it — while the label carries whatever the person actually
-- called it.

-- Unnamed in 004, so Postgres named it. Dropped first: the rename below would
-- violate the old list, and the new list would reject the rows that exist.
alter table schedule_events
  drop constraint if exists schedule_events_event_type_check;

update schedule_events
   set event_type = 'event'
 where event_type = 'shoot';

alter table schedule_events
  alter column event_type set default 'event';

-- Null for every type but `other`, which is the point of the paired constraint
-- below. Not a second free-text "notes" field — the event already has one.
alter table schedule_events
  add column if not exists event_type_other text;

alter table schedule_events
  add constraint schedule_events_event_type_check
    check (event_type in ('event', 'editing', 'review', 'delivery', 'meeting', 'other'));

-- Both directions, deliberately.
--
-- A row typed `other` with no label renders as the literal word "Other", which
-- tells the reader nothing. A row typed `meeting` that still carries a label
-- from before it was changed renders a name that contradicts its own type.
-- Neither is reachable through the API — the service normalises the pair on
-- every write — so this is the backstop for anything that talks to the
-- database directly.
alter table schedule_events
  add constraint schedule_events_event_type_other_check
    check (
      case
        when event_type = 'other'
          then event_type_other is not null
               and length(btrim(event_type_other)) between 1 and 40
        else event_type_other is null
      end
    );

comment on column schedule_events.event_type_other is
  'What the user called this kind of event. Set only when event_type = ''other'', and null otherwise.';
