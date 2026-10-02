import type { ReactNode } from 'react';
import { ArrowLeft, Bell, CalendarDays, Clock, ToggleRight } from 'lucide-react';
import { REMINDER, REMINDER_FORM } from '../data/strings/ch4';
import { Faces } from './booking-badge';

/**
 * Mika's New reminder, made from the event (storyboard Ch4, B10
 * ReminderSheet): "Mika's phone shows New reminder: 'for Reyes & Santos
 * wedding' · Leave for the hotel · … · 5:00 AM · Alarm: 'Play a sound at the
 * reminder time'."
 *
 * Follows `mobile/app/(app)/schedule/reminders/create.tsx` and
 * `mobile/components/DateTimeField.tsx`, dark: the 44 px back tile, "New
 * reminder" 22 px bold with "for <event>" under it; Title and Notes fields on
 * the card colour (16 px radius, 16 px text, `#A89489` placeholders, labels
 * 11 px bold uppercase with 2 px tracking); the Date and Time fields side by
 * side; Alerts with Alarm and Push notification, both on (the app's
 * defaults); and Cancel / Create reminder pinned to the bottom, Create on the
 * action fill once there is a title.
 *
 * Nothing here is invented: the time already reads 5:00 AM before Mika
 * touches it, because a reminder made from a timed event starts an hour
 * before it.
 *
 * The screen is taller than a phone, as the app's is (it scrolls): the bottom
 * bar overlaps the last row.
 *
 * Parts: reminder-sheet (data-state), reminder-title (data-state),
 * reminder-notes (data-state), reminder-time, alarm-row, alarm-toggle,
 * reminder-actions, create-button (faces: off, on).
 */

export type ReminderSheetState = 'empty' | 'titled' | 'filled';

function FieldLabel({ children, className = 'mb-2' }: { children: ReactNode; className?: string }) {
  return (
    <p className={`ml-1 text-[11px] font-bold uppercase leading-[14px] tracking-[2px] text-[#A08E84] ${className}`}>
      {children}
    </p>
  );
}

function DateTime({ label, value, icon, part }: { label: string; value: string; icon: ReactNode; part: string }) {
  return (
    <div className="min-w-0 flex-1">
      <FieldLabel>{label}</FieldLabel>
      <div data-part={part} className="flex items-center gap-2 rounded-[16px] bg-[#1E1B18] px-4 py-3.5">
        <span className="shrink-0 text-[#A08E84]">{icon}</span>
        <span className="min-w-0 flex-1 text-[14px] leading-5">{value}</span>
      </div>
    </div>
  );
}

function ToggleRow({ title, hint, className = '', part }: { title: string; hint: string; className?: string; part?: string }) {
  return (
    <div data-part={part} className={`flex items-center gap-3 rounded-[16px] bg-[#1E1B18] px-4 py-3.5 ${className}`}>
      <Bell aria-hidden size={17} className="shrink-0 text-[#D18A5A]" />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold leading-5">{title}</p>
        <p className="mt-0.5 text-[12px] leading-4 text-[#A08E84]">{hint}</p>
      </div>
      <ToggleRight data-part={part && `${part.replace(/-row$/, '')}-toggle`} aria-hidden size={26} className="shrink-0 text-[#D18A5A]" />
    </div>
  );
}

export function ReminderSheet({ state = 'filled', className = '' }: { state?: ReminderSheetState; className?: string }) {
  const titled = state !== 'empty';
  const noted = state === 'filled';

  return (
    <div
      data-part="reminder-sheet"
      data-state={state}
      className={`relative flex h-full flex-col overflow-hidden bg-[#161311] text-[#F2EDE8] ${className}`}
    >
      <div className="flex items-center gap-3 px-5 pb-2 pt-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-[16px] bg-[#1E1B18]">
          <ArrowLeft aria-hidden size={18} />
        </span>
        <div className="min-w-0">
          <p className="text-[22px] font-bold leading-7 tracking-tight">{REMINDER_FORM.heading}</p>
          <p className="mt-0.5 truncate text-[14px] text-[#A08E84]">{REMINDER_FORM.forEvent}</p>
        </div>
      </div>

      <div className="mt-5 px-5">
        <FieldLabel>{REMINDER_FORM.title}</FieldLabel>
        <div
          data-part="reminder-title"
          data-state={titled ? 'typed' : 'empty'}
          className={`rounded-[16px] bg-[#1E1B18] px-4 py-3.5 text-[16px] leading-5 ${titled ? 'text-[#F2EDE8]' : 'text-[#A89489]'}`}
        >
          {titled ? REMINDER.title : REMINDER_FORM.titlePlaceholder}
        </div>
      </div>

      <div className="mt-4 px-5">
        <FieldLabel>
          {REMINDER_FORM.notes}{' '}
          <span className="font-medium normal-case tracking-normal">{REMINDER_FORM.optional}</span>
        </FieldLabel>
        <div
          data-part="reminder-notes"
          data-state={noted ? 'typed' : 'empty'}
          className={`min-h-[72px] rounded-[16px] bg-[#1E1B18] px-4 py-3.5 text-[16px] leading-5 ${noted ? 'text-[#F2EDE8]' : 'text-[#A89489]'}`}
        >
          {noted ? REMINDER.notes : REMINDER_FORM.notesPlaceholder}
        </div>
      </div>

      <div className="mt-5 flex gap-3 px-5">
        <DateTime
          part="reminder-date"
          label={REMINDER_FORM.date}
          value={REMINDER_FORM.dateValue}
          icon={<CalendarDays aria-hidden size={15} />}
        />
        <DateTime
          part="reminder-time"
          label={REMINDER_FORM.time}
          value={REMINDER_FORM.timeValue}
          icon={<Clock aria-hidden size={15} />}
        />
      </div>

      <div className="mt-5 px-5">
        <FieldLabel className="mb-3">{REMINDER_FORM.alerts}</FieldLabel>
        <ToggleRow part="alarm-row" title={REMINDER_FORM.alarm} hint={REMINDER_FORM.alarmHint} />
        <ToggleRow title={REMINDER_FORM.push} hint={REMINDER_FORM.pushHint} className="mt-3" />
      </div>

      <div
        data-part="reminder-actions"
        className="absolute inset-x-0 bottom-0 flex gap-3 bg-[#161311] px-5 pb-[30px] pt-3"
      >
        <span className="flex flex-1 items-center justify-center rounded-[16px] bg-[#1E1B18] py-3.5 text-[16px] font-bold leading-5">
          {REMINDER_FORM.cancel}
        </span>
        <Faces
          part="create-button"
          block
          align="stretch"
          className="flex-[2]"
          on={titled ? 'on' : 'off'}
          faces={{
            off: (
              <span className="flex items-center justify-center rounded-[16px] bg-[#2A2522] py-3.5 text-[16px] font-bold leading-5 text-[#A08E84]">
                {REMINDER_FORM.create}
              </span>
            ),
            on: (
              <span className="flex items-center justify-center rounded-[16px] bg-[#A85D35] py-3.5 text-[16px] font-bold leading-5 text-white">
                {REMINDER_FORM.create}
              </span>
            ),
          }}
        />
      </div>
    </div>
  );
}
