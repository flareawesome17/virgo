'use client';

import { useState } from 'react';
import { Bell, BellOff, CalendarDays, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DiscardChangesDialog } from '@/components/discard-changes-dialog';
import { useCreateReminder, useUpdateReminder } from '@/hooks/useReminders';
import { useScheduleEvent } from '@/hooks/useScheduleEvents';
import type { Reminder, ScheduleEvent } from '@/api';
import {
  combineDateAndTime,
  dateToKey,
  dateToTimeString,
  formatTime,
  labelForDateKey,
} from '@/lib/calendar';
import { useDiscardGuard, useGuardedClose, useOpeningKey } from '@/lib/discard-guard';

export type NewReminderDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Told once the reminder exists, after the dialog has closed. */
  onCreated?: (reminder: Reminder) => void;
  /** Present to edit that reminder; absent to make a new one. */
  reminder?: Reminder;
  /**
   * The event it is for. A new reminder is linked to it and starts an hour
   * before it; an edit only shows it, and reads it itself when not given.
   */
  event?: ScheduleEvent;
};

/** A moment the way datetime-local holds it: local, to the minute, no zone. */
function toLocalInput(d: Date): string {
  return `${dateToKey(d)}T${dateToTimeString(d)}`;
}

/**
 * Where a new reminder starts, as on the phone: an hour before the event it
 * is for, when the event has a time and that is still ahead; otherwise the
 * next whole hour at least an hour away. It started empty here, so every
 * reminder began with building a date and a time from nothing.
 *
 * Called once per opening, from the form's initial state, never in render.
 */
function defaultWhen(event?: ScheduleEvent): string {
  const now = Date.now();
  if (event?.event_time) {
    const before = combineDateAndTime(event.event_date, event.event_time);
    before.setHours(before.getHours() - 1);
    if (before.getTime() > now) return toLocalInput(before);
  }
  const next = new Date(now + 60 * 60 * 1000);
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);
  return toLocalInput(next);
}

/**
 * New, for an event or on its own, or editing one: the phone's one form for
 * all three. Keyed on the opening, as EventDialog is, so each one starts
 * afresh.
 */
export function NewReminderDialog(props: NewReminderDialogProps) {
  const opening = useOpeningKey(props.open);
  return <NewReminderForm key={opening} {...props} />;
}

function NewReminderForm({
  open,
  onOpenChange,
  onCreated,
  reminder,
  event,
}: NewReminderDialogProps) {
  const create = useCreateReminder();
  const update = useUpdateReminder();
  const editing = Boolean(reminder);
  const pending = editing ? update.isPending : create.isPending;
  /** An edit's time as it was saved, to tell whether it has been moved. */
  const savedWhen = reminder ? toLocalInput(new Date(reminder.reminder_time)) : null;
  const [title, setTitle] = useState(reminder?.title ?? '');
  const [description, setDescription] = useState(reminder?.description ?? '');
  const [when, setWhen] = useState(() => savedWhen ?? defaultWhen(event));
  // Both on for a new one, as on the phone. The web always sent the alarm on
  // and left the push to the server, with no way to turn either off.
  const [alarm, setAlarm] = useState(reminder?.is_alarm_enabled ?? true);
  const [push, setPush] = useState(reminder?.has_push_notification ?? true);
  const { dirty } = useDiscardGuard({ title, description, when, alarm, push }, open);
  const guard = useGuardedClose(dirty, onOpenChange);
  const close = guard.close;

  // The event it is for: the one it was opened from, or, for an edit, the one
  // it was made for. A reminder carries only that event's id, so the event is
  // read on its own when the caller did not have it to hand.
  const linkedId = reminder ? (reminder.schedule_event_id ?? undefined) : event?.id;
  const given = event?.id === linkedId ? event : undefined;
  const { data: fetched } = useScheduleEvent(given ? undefined : linkedId);
  const forEvent = given ?? fetched;

  // Refused here, as on the phone: a reminder for a time already gone was
  // saved and then never went off. Judged when the time is picked and again
  // on save, since a form left open can pass the time it holds. An edit's own
  // time left where it was is not judged, so an overdue reminder can still
  // have its notes or switches changed without being moved.
  const [inPast, setInPast] = useState(false);
  const isPast = (value: string) =>
    !!value && value !== savedWhen && new Date(value).getTime() <= Date.now();

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed || !when) return;
    if (isPast(when)) {
      setInPast(true);
      return;
    }

    const fields = {
      title: trimmed,
      // Null rather than '' when cleared: the notification shows the notes
      // as its text, and "Reminder" only when there are none.
      description: description.trim() || null,
      is_alarm_enabled: alarm,
      has_push_notification: push,
    };
    // datetime-local has no zone; the Date constructor reads it as local
    // time, which is what the user meant.
    const reminderTime = new Date(when).toISOString();

    if (reminder) {
      update.mutate(
        {
          id: reminder.id,
          ...fields,
          // Only when it was moved. The field keeps whole minutes, and any
          // change to the time, even of seconds, sets a reminder that has
          // already gone off to go off again: an edit to an overdue one's
          // notes would have fired it a second time.
          ...(when !== savedWhen ? { reminder_time: reminderTime } : {}),
        },
        {
          onSuccess: () => {
            toast.success('Reminder updated');
            onOpenChange(false);
          },
          onError: (err: Error) =>
            toast.error('Could not save the reminder', { description: err.message }),
        },
      );
      return;
    }

    create.mutate(
      {
        ...fields,
        reminder_time: reminderTime,
        // Omitted rather than null when absent, as the phone sends it.
        ...(event ? { schedule_event_id: event.id } : {}),
      },
      {
        onSuccess: (created) => {
          onOpenChange(false);
          onCreated?.(created);
        },
        onError: (err: Error) =>
          toast.error('Could not create reminder', { description: err.message }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit reminder' : 'New reminder'}</DialogTitle>
          <DialogDescription>
            At this time you get an alert here, and a push on your phone if you
            use the Virgo app.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {forEvent && (
            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
              <CalendarDays className="size-4 shrink-0 text-primary" aria-hidden />
              <p className="min-w-0 flex-1 truncate text-sm">
                <span className="text-muted-foreground">For </span>
                <span className="font-semibold">{forEvent.title}</span>
              </p>
              <span className="shrink-0 text-xs text-muted-foreground">
                {labelForDateKey(forEvent.event_date)}
                {forEvent.event_time ? ` · ${formatTime(forEvent.event_time)}` : ''}
              </span>
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="reminder-title">Title</Label>
            <Input
              id="reminder-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={forEvent ? 'Pack the lighting kit' : 'Send the Reyes gallery'}
              maxLength={200}
              autoFocus={!editing}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="reminder-notes">
              Notes
              <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="reminder-notes"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Anything worth remembering…"
              maxLength={2000}
              rows={3}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="reminder-when">When</Label>
            <Input
              id="reminder-when"
              type="datetime-local"
              value={when}
              onChange={(e) => {
                setWhen(e.target.value);
                setInPast(isPast(e.target.value));
              }}
              aria-invalid={inPast || undefined}
            />
            {inPast && (
              <p className="text-xs text-destructive">
                That time has passed. Pick a later one.
              </p>
            )}
          </div>

          <div role="group" aria-labelledby="reminder-alerts" className="grid gap-2">
            <p id="reminder-alerts" className="text-sm leading-none font-medium">
              Alerts
            </p>
            <div className="flex items-start gap-3 rounded-lg border p-3">
              {alarm ? (
                <Bell className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              ) : (
                <BellOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                <Label htmlFor="reminder-alarm" className="text-sm font-semibold">
                  Alarm
                </Label>
                <p id="reminder-alarm-detail" className="mt-0.5 text-xs text-muted-foreground">
                  Play a sound at the reminder time
                </p>
              </div>
              <Switch
                id="reminder-alarm"
                checked={alarm}
                onCheckedChange={setAlarm}
                aria-describedby="reminder-alarm-detail"
                className="mt-0.5"
              />
            </div>
            <div className="flex items-start gap-3 rounded-lg border p-3">
              <Bell
                className={
                  push
                    ? 'mt-0.5 size-4 shrink-0 text-primary'
                    : 'mt-0.5 size-4 shrink-0 text-muted-foreground'
                }
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <Label htmlFor="reminder-push" className="text-sm font-semibold">
                  Push notification
                </Label>
                {/* The phone says "to this device"; from here, the device is
                    the phone the app is on. */}
                <p id="reminder-push-detail" className="mt-0.5 text-xs text-muted-foreground">
                  Send a notification to your phone
                </p>
              </div>
              <Switch
                id="reminder-push"
                checked={push}
                onCheckedChange={setPush}
                aria-describedby="reminder-push-detail"
                className="mt-0.5"
              />
            </div>
            {/* The server only sends a reminder with one of the two on, and
                that includes the alert here. Said, so turning both off is a
                choice rather than a reminder that quietly never arrives. */}
            {!alarm && !push && (
              <p className="text-xs text-muted-foreground">
                With both off, nothing goes off at that time. It stays on your schedule.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button disabled={!title.trim() || !when || inPast || pending} onClick={submit}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {editing ? 'Save reminder' : 'Create reminder'}
          </Button>
        </DialogFooter>
      </DialogContent>
      <DiscardChangesDialog guard={guard} />
    </Dialog>
  );
}
