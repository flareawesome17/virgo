'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DiscardChangesDialog } from '@/components/discard-changes-dialog';
import { InvitePeople } from '@/components/event-invites';
import { LocationField } from '@/components/location-field';
import {
  useCreateScheduleEvent,
  useInviteToEvent,
  useUpdateScheduleEvent,
} from '@/hooks/useScheduleEvents';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import type { EventType, ScheduleEvent } from '@/api';
import { useDiscardGuard, useGuardedClose, useOpeningKey } from '@/lib/discard-guard';

/**
 * Written out with labels rather than capitalising the value, because one of
 * them is not a word — "Others (specify)" is an instruction, and `other`
 * capitalised reads as a category nobody would pick on purpose.
 */
const EVENT_TYPES: { value: EventType; label: string }[] = [
  { value: 'event', label: 'Event' },
  { value: 'editing', label: 'Editing' },
  { value: 'review', label: 'Review' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'other', label: 'Others (specify)' },
];


/**
 * An event's time the way the time input wants it.
 *
 * Postgres `time` comes back as HH:MM:SS; <input type="time"> wants HH:MM and
 * silently renders empty otherwise.
 */
function timeInputValue(event: ScheduleEvent | undefined): string {
  return event?.event_time ? event.event_time.slice(0, 5) : '';
}

/** The workspace select's value for an event that belongs to none. */
const NO_WORKSPACE = 'none';


export type EventDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate: string;
  /** The workspace a new event starts in: "Add" from a workspace's Coming up. */
  defaultWorkspaceId?: string | null;
  /** Present to edit that event; absent to create a new one. */
  event?: ScheduleEvent;
  /** Told once a new event exists, after the dialog has closed. */
  onCreated?: (event: ScheduleEvent) => void;
};

/**
 * Filled afresh on every opening, not just on mount: the New event dialog
 * stays mounted between uses, so it would otherwise open on the day it was
 * last opened for, with whatever was typed and thrown away last time. The
 * form is keyed on the opening instead, which also gives the discard guard a
 * clean starting point each time.
 */
export function EventDialog(props: EventDialogProps) {
  const opening = useOpeningKey(props.open);
  return <EventDialogForm key={opening} {...props} />;
}

function EventDialogForm({
  open,
  onOpenChange,
  defaultDate,
  defaultWorkspaceId,
  event,
  onCreated,
}: EventDialogProps) {
  const create = useCreateScheduleEvent();
  const update = useUpdateScheduleEvent();
  const invite = useInviteToEvent();
  const editing = Boolean(event);
  /** Editing something somebody else created. Undefined means just-created. */
  const guestEdit = editing && event?.is_owner === false;
  const pending = editing ? update.isPending : create.isPending;
  const [title, setTitle] = useState(event?.title ?? '');
  const [description, setDescription] = useState(event?.description ?? '');
  const [date, setDate] = useState(event?.event_date ?? defaultDate);
  const [time, setTime] = useState(timeInputValue(event));
  // Said and chosen, as on the phone. An empty time always saved as all day,
  // but nothing said so, and clearing a time input is not something people
  // think to do.
  const [allDay, setAllDay] = useState(editing && !event?.event_time);
  const [type, setType] = useState<EventType>(
    (event?.event_type as EventType | undefined) ?? 'event',
  );
  const [otherLabel, setOtherLabel] = useState(event?.event_type_other ?? '');
  const [location, setLocation] = useState(event?.location ?? '');
  const [guests, setGuests] = useState<string[]>([]);
  const [workspaceId, setWorkspaceId] = useState(
    event?.workspace_id ?? defaultWorkspaceId ?? NO_WORKSPACE,
  );
  // Your own workspaces only: an event is filed under a workspace the same
  // way an album is, and only its owner can do that.
  const { workspaces: listed } = useWorkspaces(
    { limit: 100, orderBy: 'name', direction: 'asc' },
    { enabled: open && !guestEdit },
  );
  const ownWorkspaces = listed.filter((w) => w.is_owner);

  // An "other" event is only half-described until it is named, so the save
  // button waits for the name the same way it waits for the title.
  const needsLabel = type === 'other' && !otherLabel.trim();

  const { dirty } = useDiscardGuard(
    { title, description, date, time, allDay, type, otherLabel, location, guests, workspaceId },
    open,
  );
  // Escape, the overlay, the X and Cancel all come through `close`. A save
  // closes through onOpenChange directly, which nobody needs to confirm.
  const guard = useGuardedClose(dirty, onOpenChange);
  const close = guard.close;
  const eventTime = allDay ? null : time || null;

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed || !date || needsLabel) return;

    // Sent on every save, not only when `other` is chosen: switching away from
    // it has to clear the old name, and omitting the field would leave the
    // server to guess whether that was intended.
    const typeFields = {
      event_type: type,
      event_type_other: type === 'other' ? otherLabel.trim() : null,
      // Null rather than '' when cleared, so "has a location" stays one check.
      // The server settles the spelling — "cebu" comes back as "Cebu City".
      location: location.trim() || null,
      // A guest cannot file somebody else's event under a workspace, so their
      // edit leaves it where it is.
      ...(guestEdit ? {} : { workspace_id: workspaceId === NO_WORKSPACE ? null : workspaceId }),
    };

    if (event) {
      update.mutate(
        {
          id: event.id,
          title: trimmed,
          description: description.trim() || null,
          event_date: date,
          event_time: eventTime,
          ...typeFields,
        },
        {
          onSuccess: () => {
            toast.success('Event updated');
            onOpenChange(false);
          },
          onError: (err: Error) =>
            toast.error('Could not save the event', { description: err.message }),
        },
      );
      return;
    }

    create.mutate(
      {
        title: trimmed,
        description: description.trim() || null,
        event_date: date,
        event_time: eventTime,
        ...typeFields,
      },
      {
        onSuccess: (event) => {
          // Invitations are a second call on purpose: the event exists either
          // way, so a failure here loses the invitations, not the event.
          if (guests.length > 0) {
            invite.mutate(
              { eventId: event.id, userIds: guests },
              {
                onSuccess: ({ invited }) =>
                  toast.success(
                    `Event created · invited ${invited} ${invited === 1 ? 'person' : 'people'}`,
                  ),
                onError: (err: Error) =>
                  toast.error('Event created, but the invitations failed', {
                    description: err.message,
                  }),
              },
            );
          }
          // Nothing to reset: the next opening mounts a fresh form.
          onOpenChange(false);
          onCreated?.(event);
        },
        onError: (err: Error) =>
          toast.error('Could not create event', { description: err.message }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit event' : 'New event'}</DialogTitle>
          <DialogDescription>
            {!editing
              ? 'A shoot, an edit, a meeting — or anything else you name.'
              : guestEdit
                ? // Says who owns it and that the change is not quiet. Editing
                  // somebody else's event should feel like an act with an
                  // audience, because it is one.
                  event?.organiser_name
                  ? `This is ${event.organiser_name}’s event. They and everyone going will be told what you changed.`
                  : 'This is not your event. The organiser and everyone going will be told what you changed.'
                : 'Anyone who accepted sees these changes on their own calendar.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="event-title">Title</Label>
            <Input
              id="event-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Reyes wedding — ceremony"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="event-date">Date</Label>
              {/* A native date input: the browser gives a real, localised,
                  keyboard-accessible picker for free. */}
              <Input
                id="event-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="event-time">Time</Label>
              <Input
                id="event-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                disabled={allDay}
              />
            </div>
          </div>

          <div className="-mt-1 flex items-center gap-2">
            <Checkbox
              id="event-all-day"
              checked={allDay}
              onCheckedChange={(checked) => {
                const next = checked === true;
                setAllDay(next);
                // Cleared rather than kept behind the box: unticking it later
                // should not bring back a time that was decided against.
                if (next) setTime('');
              }}
            />
            <Label htmlFor="event-all-day" className="font-normal">
              All day
            </Label>
          </div>

          <div className="grid gap-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as EventType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EVENT_TYPES.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {type === 'other' && (
              <Input
                id="event-type-other"
                value={otherLabel}
                onChange={(e) => setOtherLabel(e.target.value)}
                placeholder="Client viewing"
                maxLength={40}
                aria-label="What kind of event"
                autoFocus
              />
            )}
          </div>

          {!guestEdit && ownWorkspaces.length > 0 && (
            <div className="grid gap-2">
              <Label htmlFor="event-workspace">Workspace</Label>
              <Select value={workspaceId} onValueChange={setWorkspaceId}>
                <SelectTrigger id="event-workspace">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_WORKSPACE}>None</SelectItem>
                  {ownWorkspaces.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="event-location">Where</Label>
            <LocationField
              id="event-location"
              value={location}
              onChange={setLocation}
              placeholder="Cebu City, or the venue"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="event-description">Notes</Label>
            <Textarea
              id="event-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
              rows={3}
            />
          </div>

          {/* Guests are managed from the event's own Users button once it
              exists, so an edit does not offer to invite anyone. */}
          {!editing && (
            <div className="grid gap-2 border-t pt-3">
              <Label>
                Invite collaborators
                {guests.length > 0 && (
                  <span className="ml-1 font-normal text-muted-foreground">
                    · {guests.length} selected
                  </span>
                )}
              </Label>
              <p className="-mt-1 text-xs text-muted-foreground">
                They choose whether to join. Accepting puts it on their calendar.
              </p>
              <InvitePeople selected={guests} onChange={setGuests} />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={!title.trim() || !date || needsLabel || pending}
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            {editing ? 'Save changes' : 'Create event'}
          </Button>
        </DialogFooter>
      </DialogContent>
      <DiscardChangesDialog guard={guard} />
    </Dialog>
  );
}
