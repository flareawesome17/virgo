import { Bell, CalendarDays, ChevronRight, Plus } from 'lucide-react';
import { DAY_DOT_SIZE, EVENT_COLORS, getMonthWeeks, type MonthCell } from '@/lib/calendar';
import { AGENDA, CALENDAR, EVENT } from '../data/strings/ch4';
import { Faces } from './booking-badge';
import { AttendeeSummary, TimeRoll, isMoved, type EventBeat } from './event-detail';

/**
 * Mika's calendar, as the phone's Schedule tab draws it (storyboard Ch4, B10
 * MonthGrid): "a December month grid (Sunday first). Sat 12 is selected and
 * glows gold, with one event dot."
 *
 * The grid is the app's own: `getMonthWeeks` from `lib/calendar.ts` (the
 * phone's copy is identical), six weeks of seven, Sunday first, the dot
 * colour from `EVENT_COLORS`. Only "today" is overridden, from the chapter's
 * fixed `now` (Friday 11 December), so the server and every later year draw
 * the same cell.
 *
 * Styling follows `mobile/app/(app)/(tabs)/schedule.tsx`, dark: the card on
 * the secondary surface `#26221F`, 16 px radius, 16 px padding; 44 px month
 * buttons on the card colour; two-letter weekdays 11 px bold muted; 32 px day
 * circles with 12 px bold numbers. Today is filled with the action colour
 * `#A85D35` and white; the selected day is primary at 15% with primary text;
 * days outside the month are muted at 40%; a day with an event gets a 6 px
 * dot below its circle.
 *
 * `DayAgenda` is the section under the card: the selected day's heading
 * ("Tomorrow", since the chapter looks on Friday night) and the event's
 * agenda row, with who is going and the call time.
 *
 * Parts: month-grid (data-state, data-view), month-title, week-<n>
 * (data-week), selected-week, day-<YYYY-MM-DD> on every cell, today,
 * selected-day (faces: off, on), event-dot. DayAgenda: agenda (data-state),
 * agenda-row, attendee-summary (faces 0–3), call-roll, agenda-bell.
 */

export type MonthGridState = 'today' | 'selected';

function DayCell({ cell, today, selected, dot }: { cell: MonthCell; today: boolean; selected: boolean; dot: boolean }) {
  const isSelected = cell.key === CALENDAR.selectedKey;
  const ink = cell.isOutside ? 'text-[rgba(160,142,132,0.4)]' : 'text-[#F2EDE8]';

  return (
    <div data-part={`day-${cell.key}`} className="flex flex-1 flex-col items-center py-1.5">
      {today ? (
        <span
          data-part="today"
          className="flex size-8 items-center justify-center rounded-full bg-[#A85D35] text-[12px] font-bold text-white"
        >
          {cell.day}
        </span>
      ) : isSelected ? (
        // Drawn both ways in place, so Mika's tap is an opacity flip.
        <Faces
          part="selected-day"
          on={selected ? 'on' : 'off'}
          faces={{
            off: (
              <span className={`flex size-8 items-center justify-center rounded-full text-[12px] font-bold ${ink}`}>
                {cell.day}
              </span>
            ),
            on: (
              <span className="flex size-8 items-center justify-center rounded-full bg-[rgba(209,138,90,0.15)] text-[12px] font-bold text-[#D18A5A]">
                {cell.day}
              </span>
            ),
          }}
        />
      ) : (
        <span className={`flex size-8 items-center justify-center rounded-full text-[12px] font-bold ${ink}`}>
          {cell.day}
        </span>
      )}
      {dot && (
        <span className="mt-0.5 flex items-center gap-[3px]" style={{ opacity: cell.isOutside ? 0.35 : 1 }}>
          <span
            data-part="event-dot"
            className="rounded-full"
            style={{ width: DAY_DOT_SIZE, height: DAY_DOT_SIZE, background: EVENT_COLORS.event }}
          />
        </span>
      )}
    </div>
  );
}

export function MonthGrid({
  state = 'selected',
  view = 'month',
  className = '',
}: {
  /** today: the tab as it opens, on today. selected: Mika has tapped Saturday. */
  state?: MonthGridState;
  /** month: all six weeks. week: only the week holding the wedding (mobile Ch4). */
  view?: 'month' | 'week';
  className?: string;
}) {
  const weeks = getMonthWeeks(CALENDAR.year, CALENDAR.month);
  const selectedWeek = weeks.findIndex((w) => w.some((c) => c.key === CALENDAR.selectedKey));
  const shown = view === 'week' ? [selectedWeek] : weeks.map((_, i) => i);

  return (
    <div
      data-part="month-grid"
      data-state={state}
      data-view={view}
      className={`rounded-[16px] bg-[#26221F] p-4 text-[#F2EDE8] ${className}`}
    >
      <div className="mb-4 flex items-center justify-between">
        <span className="flex size-11 items-center justify-center rounded-[12px] bg-[#1E1B18] text-[14px] font-bold">
          {CALENDAR.prev}
        </span>
        <span data-part="month-title" className="text-[16px] font-bold tracking-tight">
          {CALENDAR.title}
        </span>
        <span className="flex items-center gap-2">
          <span className="text-[12px] font-semibold text-[#D18A5A]">{CALENDAR.full}</span>
          <span className="flex size-11 items-center justify-center rounded-[12px] bg-[#1E1B18] text-[14px] font-bold">
            {CALENDAR.next}
          </span>
        </span>
      </div>
      <div className="mb-1 flex">
        {CALENDAR.weekdays.map((d) => (
          <span key={d} className="flex-1 py-1 text-center text-[11px] font-bold text-[#A08E84]">
            {d}
          </span>
        ))}
      </div>
      {shown.map((w) => (
        <div
          key={w}
          data-part={w === selectedWeek ? 'selected-week' : `week-${w}`}
          data-week={w}
          className="flex"
        >
          {weeks[w].map((cell) => (
            <DayCell
              key={cell.key}
              cell={cell}
              today={cell.key === CALENDAR.todayKey}
              selected={state === 'selected'}
              dot={cell.key === CALENDAR.selectedKey}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** What the section under the card shows: today's empty day, or the wedding at a Ch4 beat. */
export type AgendaState = 'empty' | EventBeat;

/** The selected day's label (labelForDateKey) and the link to its agenda, over either state. */
function AgendaHeading({ label }: { label: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <p className="text-[18px] font-bold leading-7 tracking-tight">{label}</p>
      <span className="flex items-center gap-1 text-[#D18A5A]">
        <span className="text-[14px] font-semibold">{AGENDA.link}</span>
        <ChevronRight aria-hidden size={14} />
      </span>
    </div>
  );
}

export function DayAgenda({ state = 'reminded', className = '' }: { state?: AgendaState; className?: string }) {
  if (state === 'empty') {
    return (
      <div data-part="agenda" data-state={state} className={`text-[#F2EDE8] ${className}`}>
        <AgendaHeading label={AGENDA.today} />
        <div className="flex flex-col items-center gap-3 rounded-[16px] bg-[#1E1B18] p-6">
          <span className="flex size-12 items-center justify-center rounded-full bg-[#2A2522]">
            <CalendarDays aria-hidden size={22} className="text-[#A08E84]" />
          </span>
          <p className="text-[14px] font-medium text-[#A08E84]">{AGENDA.empty}</p>
          <span className="flex min-h-11 items-center gap-2 rounded-[12px] bg-[#A85D35] px-5 py-2.5 text-white">
            <Plus aria-hidden size={15} />
            <span className="text-[14px] font-semibold">{AGENDA.addEvent}</span>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div data-part="agenda" data-state={state} className={`text-[#F2EDE8] ${className}`}>
      <AgendaHeading label={AGENDA.tomorrow} />
      <div className="overflow-hidden rounded-[16px] border border-[rgba(54,47,43,0.3)] bg-[#1E1B18]">
        <div data-part="agenda-row" className="flex items-center gap-3 px-4 py-3.5">
          <span
            className="flex size-[34px] shrink-0 items-center justify-center rounded-[10px]"
            style={{ background: `${EVENT_COLORS.event}18` }}
          >
            <CalendarDays aria-hidden size={16} color={EVENT_COLORS.event} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-bold leading-5">{EVENT.title}</p>
            <p className="mt-0.5 text-[12px] text-[#A08E84]">{EVENT.type}</p>
            <AttendeeSummary beat={state} />
          </div>
          <div className="flex flex-col items-end gap-1">
            <p className="text-[14px] font-bold">
              <TimeRoll moved={isMoved(state)} />
            </p>
            {state === 'reminded' && <Bell data-part="agenda-bell" aria-hidden size={11} className="text-[#D18A5A]" />}
          </div>
        </div>
      </div>
    </div>
  );
}
