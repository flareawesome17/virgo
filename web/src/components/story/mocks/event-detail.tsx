import { ArrowLeft, Bell, CalendarDays, Circle, Clock, MapPin, Plus, UserPlus, X } from 'lucide-react';
import {
  ATTENDEES,
  CALL_ROLL,
  EVENT,
  GUEST_NAME,
  GUESTS,
  REMINDER,
  attendeeLine,
  type Guest,
} from '../data/strings/ch4';
import { Avatar } from './avatar';
import { Faces } from './booking-badge';

/**
 * The wedding as Mika's phone shows it (storyboard Ch4, B10 EventDetail +
 * Attendees): "Under 'Who’s coming', Ernie, Kenn and Bea flip from Invited to
 * Going… The time digits roll 6:30 → 6:00."
 *
 * Follows `mobile/app/(app)/schedule/[eventId].tsx` and the organiser's
 * guest list in `mobile/components/EventInvites.tsx`, dark:
 *
 * - the hero: the event colour at 8% behind the back tile, a 56 px icon tile,
 *   the title 20 px bold and the type pill ("EVENT");
 * - the date and time card ("Saturday, December 12, 2026"; the time rolls),
 *   then Where;
 * - "Who’s coming": a 34 px tinted avatar per guest, the name 14 px semibold
 *   and the status 11 px semibold, "Invited" `#A89489` or "Going" `#6B8E4E`;
 * - Reminders: "No reminders set" until Mika adds one, then its row (title,
 *   "5:00 AM", the alarm bell and the push chip).
 *
 * The screen runs past a phone's height, as the app's does: Reminders sits at
 * the bottom edge and is cut by the screen.
 *
 * Deviations, for AA at small sizes (§1.5): the type pill's text is `#D18A5A`
 * rather than the event colour `#B66A40`, the push chip's is `#6D90B1` rather
 * than `#5B7B9A`, and the 10 px labels and 7 px chip are 11 px.
 *
 * Parts: event (data-state), event-hero, event-when, call-roll (the minutes
 * column: translateY 0 shows :30, −20 px shows :00), event-where, attendees,
 * attendee-<guest>, status-<guest> (faces: pending, accepted),
 * event-reminders, reminder-row.
 */

/** Ch4's beats on Mika's phone, in order. */
export type EventBeat = 'invited' | 'going-1' | 'going-2' | 'going' | 'moved' | 'reminded';

/** How many of the crew have said yes at each beat (they answer in invitation order). */
export const GOING_AT: Record<EventBeat, number> = {
  invited: 0,
  'going-1': 1,
  'going-2': 2,
  going: 3,
  moved: 3,
  reminded: 3,
};

/** Whether the call time has moved to 6:00 yet. */
export const isMoved = (beat: EventBeat) => beat === 'moved' || beat === 'reminded';

const EVENT_COLOR = '#B66A40';

/**
 * The call time with its minutes on a roll: "6:" and " AM" stay put, and the
 * minutes column slides from 30 to 00. `lineHeight` must match the text's.
 */
export function TimeRoll({
  moved,
  lineHeight = 20,
  part = 'call-roll',
}: {
  moved: boolean;
  lineHeight?: number;
  part?: string;
}) {
  return (
    <span className="whitespace-nowrap tabular-nums" style={{ lineHeight: `${lineHeight}px` }}>
      {CALL_ROLL.hour}
      <span className="inline-block overflow-hidden align-top" style={{ height: lineHeight }}>
        <span
          data-part={part}
          data-state={moved ? 'to' : 'from'}
          className="flex flex-col"
          style={{ transform: moved ? `translateY(-${lineHeight}px)` : undefined }}
        >
          <span style={{ height: lineHeight }}>{CALL_ROLL.from}</span>
          <span style={{ height: lineHeight }}>{CALL_ROLL.to}</span>
        </span>
      </span>
      {CALL_ROLL.suffix}
    </span>
  );
}

/**
 * AttendeeSummary, for an agenda row: up to three 16 px faces of the people
 * going, overlapped, then who is going and how many are still to answer.
 * Every count is drawn in place (faces 0–3), so a stage can step through the
 * acceptances.
 */
export function AttendeeSummary({ beat, part = 'attendee-summary' }: { beat: EventBeat; part?: string }) {
  const line = (n: number) => {
    const going = GUESTS.slice(0, n).map((g) => GUEST_NAME[g]);
    return (
      <span className="flex items-center gap-1.5">
        {going.slice(0, 3).map((name, i) => (
          <span key={name} style={{ marginLeft: i === 0 ? 0 : -8 }}>
            <Avatar surface="phone-attendee" name={name} size={16} />
          </span>
        ))}
        <span className="truncate text-[11px] leading-4 text-[#A08E84]">{attendeeLine(going, GUESTS.length - n)}</span>
      </span>
    );
  };
  return (
    <Faces
      part={part}
      block
      className="mt-1"
      on={String(GOING_AT[beat])}
      faces={{ '0': line(0), '1': line(1), '2': line(2), '3': line(3) }}
    />
  );
}

/** "Who’s coming": the organiser's guest list. */
export function Attendees({ state = 'going', className = '' }: { state?: EventBeat; className?: string }) {
  const going = GOING_AT[state];
  return (
    <div data-part="attendees" className={`mt-5 px-5 ${className}`}>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[16px] font-bold tracking-tight">{ATTENDEES.heading}</p>
        <span className="flex items-center gap-1 text-[#D18A5A]">
          <UserPlus aria-hidden size={13} />
          <span className="text-[14px] font-semibold">{ATTENDEES.invite}</span>
        </span>
      </div>
      <div className="overflow-hidden rounded-[16px] bg-[#1E1B18]">
        {GUESTS.map((g: Guest, i) => (
          <div
            key={g}
            data-part={`attendee-${g}`}
            className="flex items-center gap-3 px-4 py-3"
            style={i < GUESTS.length - 1 ? { borderBottom: '1px solid #2A2522' } : undefined}
          >
            <Avatar surface="phone-attendee" name={GUEST_NAME[g]} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold leading-5">{GUEST_NAME[g]}</p>
              <Faces
                part={`status-${g}`}
                block
                className="mt-px"
                on={i < going ? 'accepted' : 'pending'}
                faces={{
                  pending: (
                    <span className="text-[11px] font-semibold leading-[14px]" style={{ color: ATTENDEES.color.pending }}>
                      {ATTENDEES.status.pending}
                    </span>
                  ),
                  accepted: (
                    <span className="text-[11px] font-semibold leading-[14px]" style={{ color: ATTENDEES.color.accepted }}>
                      {ATTENDEES.status.accepted}
                    </span>
                  ),
                }}
              />
            </div>
            <span className="flex size-8 items-center justify-center">
              <X aria-hidden size={14} className="text-[#A08E84]" />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Label({ children }: { children: string }) {
  return <p className="text-[11px] font-semibold uppercase leading-[14px] text-[#A08E84]">{children}</p>;
}

export function EventDetail({ state = 'reminded', className = '' }: { state?: EventBeat; className?: string }) {
  const moved = isMoved(state);
  return (
    <div data-part="event" data-state={state} className={`flex h-full flex-col bg-[#161311] text-[#F2EDE8] ${className}`}>
      <div data-part="event-hero" className="px-5 pb-6 pt-1" style={{ background: `${EVENT_COLOR}14` }}>
        <span className="mb-4 flex size-11 items-center justify-center rounded-[16px] bg-[#1E1B18] shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
          <ArrowLeft aria-hidden size={18} />
        </span>
        <div className="flex items-center gap-4">
          <span
            className="flex size-14 shrink-0 items-center justify-center rounded-[18px]"
            style={{ background: `${EVENT_COLOR}22` }}
          >
            <CalendarDays aria-hidden size={26} color={EVENT_COLOR} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[20px] font-bold leading-[25px] tracking-tight">{EVENT.title}</p>
            <div className="mt-1.5 flex items-center gap-2">
              <span
                className="rounded-[6px] px-2 py-[3px] text-[11px] font-bold uppercase tracking-[0.4px] text-[#D18A5A]"
                style={{ background: `${EVENT_COLOR}22` }}
              >
                {EVENT.type}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div
        data-part="event-when"
        className="relative mx-5 -mt-3 flex items-center gap-4 rounded-[16px] bg-[#1E1B18] p-4 shadow-[0_3px_10px_rgba(0,0,0,0.05)]"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <CalendarDays aria-hidden size={14} color={EVENT_COLOR} className="shrink-0" />
          <div className="min-w-0">
            <Label>{EVENT.labels.date}</Label>
            <p className="text-[14px] font-bold leading-5">{EVENT.date}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Clock aria-hidden size={14} color={EVENT_COLOR} className="shrink-0" />
          <div>
            <Label>{EVENT.labels.time}</Label>
            <p className="text-[14px] font-bold">
              <TimeRoll moved={moved} />
            </p>
          </div>
        </div>
      </div>

      <div data-part="event-where" className="mx-5 mt-4 flex items-center gap-3 rounded-[16px] bg-[#1E1B18] p-4">
        <MapPin aria-hidden size={14} color={EVENT_COLOR} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <Label>{EVENT.labels.where}</Label>
          <p className="text-[14px] font-bold leading-5">{EVENT.location}</p>
        </div>
      </div>

      <Attendees state={state} />

      <div data-part="event-reminders" className="mt-5 px-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[16px] font-bold tracking-tight">{EVENT.reminders}</p>
          <span className="flex items-center gap-1 text-[#D18A5A]">
            <Plus aria-hidden size={13} />
            <span className="text-[14px] font-semibold">{EVENT.add}</span>
          </span>
        </div>
        {state === 'reminded' ? (
          <div data-part="reminder-row" className="flex items-center gap-3 rounded-[16px] bg-[#1E1B18] px-4 py-3">
            <Circle aria-hidden size={18} className="shrink-0 text-[#A08E84]" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold leading-5">{REMINDER.title}</p>
              <div className="mt-0.5 flex items-center gap-2">
                <span className="text-[12px] text-[#A08E84]">{REMINDER.time}</span>
                <Bell aria-hidden size={9} className="text-[#D18A5A]" />
                <span className="rounded-[3px] bg-[#5B7B9A18] px-[3px] py-px text-[11px] font-bold leading-none text-[#6D90B1]">
                  {EVENT.push}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-[16px] bg-[#1E1B18] p-6">
            <Bell aria-hidden size={18} className="text-[#A08E84]" />
            <p className="text-[14px] text-[#A08E84]">{EVENT.noReminders}</p>
          </div>
        )}
      </div>
    </div>
  );
}
