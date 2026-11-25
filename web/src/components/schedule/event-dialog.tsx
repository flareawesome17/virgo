'use client';

import { useState, type KeyboardEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog } from '@/components/ui/dialog';
import { DiscardChangesDialog } from '@/components/discard-changes-dialog';
import { InvitePeople } from '@/components/event-invites';
import { LocationField } from '@/components/location-field';
import {
  ChoiceChip,
  FORM_INPUT,
  FORM_SUBMIT,
  FORM_TEXTAREA,
  FormCard,
  FormField,
  FormRow,
  FormSection,
  FormSwitchRow,
} from '@/components/kit';
import {
  useCreateScheduleEvent,
  useInviteToEvent,
  useUpdateScheduleEvent,
} from '@/hooks/useScheduleEvents';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import type { EventType, ScheduleEvent } from '@/api';
import { parseDateKey } from '@/lib/calendar';
import { useDiscardGuard, useGuardedClose, useOpeningKey } from '@/lib/discard-guard';
import { cn } from '@/lib/utils';
import {
  FORM_FIELD_FILL,
  FORM_ROW_CORNERS,
  FORM_ROW_INPUT,
  FormDialogContent,
  FormInputRow,
  FormSelectRow,
} from './form-dialog';

/**
 * Written out with labels rather than capitalising the value, because one of
 * them is not a kind at all: "Other" asks for the name the person gives it,
 * and that name is what every screen then prints.
 */
const EVENT_TYPES: { value: EventType; label: string }[] = [
  { value: 'event', label: 'Event' },
  { value: 'editing', label: 'Editing' },
  { value: 'review', label: 'Review' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'other', label: 'Other' },
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

/**
 * LocationField as the value of a row: its own box and pin taken off, its
 * text set to the right like the values under it. Done from outside because
 * the job forms use the same field as a box, and must keep it.
 */
const PLACE_IN_ROW =
  'min-w-0 flex-1 [&>div>svg]:hidden [&_input]:h-9 [&_input]:border-0 [&_input]:bg-transparent [&_input]:pl-2 [&_input]:pr-1 [&_input]:text-right [&_input]:font-semibold [&_input::placeholder]:font-normal [&_input:focus-visible]:ring-0 dark:[&_input]:bg-transparent';


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
  /** Whether the people to invite are on show under their row. */
  const [inviting, setInviting] = useState(false);
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
  // Escape, the overlay and the X all come through `close`. A save closes
  // through onOpenChange directly, which nobody needs to confirm.
  const guard = useGuardedClose(dirty, onOpenChange);
  const close = guard.close;
  const eventTime = allDay ? null : time || null;

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed || !date || needsLabel || pending) return;

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

  // Enter in a one-line field saves, as in the other two Create forms. Not
  // while an input method is still composing the word being typed.
  const submitOnEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit();
  };

  const chosenWorkspace = listed.find((w) => w.id === workspaceId);

  return (
    <Dialog open={open} onOpenChange={close}>
      <FormDialogContent
        wide
        title={editing ? 'Edit event' : 'New event'}
        // An edit says who else it reaches before anything is changed.
        // Editing somebody else's event should feel like an act with an
        // audience, because it is one.
        notice={editing}
        description={
          !editing
            ? 'A shoot, an edit, a meeting — or anything else you name.'
            : guestEdit
              ? event?.organiser_name
                ? `This is ${event.organiser_name}’s event. They and everyone going will be told what you changed.`
                : 'This is not your event. The organiser and everyone going will be told what you changed.'
              : 'Anyone who accepted sees these changes on their own calendar.'
        }
        footer={
          <Button
            type="button"
            className={FORM_SUBMIT}
            onClick={submit}
            disabled={!title.trim() || !date || needsLabel || pending}
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            {editing ? 'Save changes' : 'Create event'}
          </Button>
        }
      >
        {/* What it is, first, as on the phone. */}
        <FormField label="What is it?" htmlFor="event-title">
          <Input
            id="event-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={submitOnEnter}
            placeholder="Prenup shoot, Ana & Marco"
            className={cn(FORM_INPUT, FORM_FIELD_FILL)}
            autoFocus
          />
        </FormField>

        <FormField label="Kind">
          <div role="group" aria-label="Kind" className="flex flex-wrap gap-2">
            {EVENT_TYPES.map(({ value, label }) => (
              <ChoiceChip key={value} on={type === value} onClick={() => setType(value)}>
                {label}
              </ChoiceChip>
            ))}
          </div>
          {type === 'other' && (
            <Input
              id="event-type-other"
              value={otherLabel}
              onChange={(e) => setOtherLabel(e.target.value)}
              onKeyDown={submitOnEnter}
              placeholder="Client viewing"
              maxLength={40}
              aria-label="What kind of event"
              className={cn(FORM_INPUT, FORM_FIELD_FILL, 'mt-1')}
              autoFocus
            />
          )}
        </FormField>

        <FormSection title="When">
          <FormCard>
            <FormInputRow label="Date" htmlFor="event-date">
              {date && (
                <span aria-hidden className="text-muted-foreground">
                  {parseDateKey(date).toLocaleDateString('en-US', { weekday: 'short' })}
                </span>
              )}
              {/* A native date input: the browser gives a real, localised,
                  keyboard-accessible picker for free, and it takes typing. */}
              <input
                id="event-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={FORM_ROW_INPUT}
              />
            </FormInputRow>
            {!allDay && (
              <FormInputRow label="Time" htmlFor="event-time">
                <input
                  id="event-time"
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className={FORM_ROW_INPUT}
                />
              </FormInputRow>
            )}
            <FormSwitchRow
              label="All day"
              checked={allDay}
              onCheckedChange={(next) => {
                setAllDay(next);
                // Cleared rather than kept behind the switch: turning it off
                // later should not bring back a time that was decided against.
                if (next) setTime('');
              }}
            />
          </FormCard>
        </FormSection>

        <FormSection title={editing ? 'Where' : 'Where and who'}>
          {/* Not clipped, unlike every other card: the place's suggestions
              drop out of the bottom of its row. */}
          <FormCard className="overflow-visible">
            <div
              className={cn(
                'flex min-h-12 items-center gap-3 pl-4 pr-3 text-sm transition-colors focus-within:bg-muted/50',
                FORM_ROW_CORNERS,
              )}
            >
              <label htmlFor="event-location" className="shrink-0 text-secondary-foreground">
                Place
              </label>
              <div className={PLACE_IN_ROW}>
                <LocationField
                  id="event-location"
                  value={location}
                  onChange={setLocation}
                  placeholder="Cebu City, or the venue"
                />
              </div>
            </div>

            {!guestEdit && ownWorkspaces.length > 0 && (
              <FormSelectRow
                id="event-workspace"
                label="Workspace"
                value={workspaceId}
                onValueChange={setWorkspaceId}
                display={
                  workspaceId === NO_WORKSPACE ? 'None' : (chosenWorkspace?.name ?? 'Another workspace')
                }
                placeholder={workspaceId === NO_WORKSPACE}
                options={[
                  { value: NO_WORKSPACE, label: 'None' },
                  ...ownWorkspaces.map((w) => ({ value: w.id, label: w.name })),
                ]}
                className={FORM_ROW_CORNERS}
              />
            )}

            {/* Guests are managed from the event's own panel once it exists,
                so an edit does not offer to invite anyone. */}
            {!editing && (
              <FormRow
                label="Invite"
                value={guests.length > 0 ? `${guests.length} chosen` : 'Nobody yet'}
                placeholder={guests.length === 0}
                aria-expanded={inviting}
                aria-controls="event-invite"
                onClick={() => setInviting((on) => !on)}
                className={FORM_ROW_CORNERS}
              />
            )}
            {!editing && inviting && (
              <div id="event-invite" className="flex flex-col gap-2 px-4 py-3">
                <p className="text-xs text-muted-foreground">
                  They choose whether to join. Accepting puts it on their calendar.
                </p>
                <InvitePeople selected={guests} onChange={setGuests} />
              </div>
            )}
          </FormCard>
        </FormSection>

        <FormField label="Notes" htmlFor="event-description" optional>
          <Textarea
            id="event-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What to bring, where to park…"
            rows={3}
            className={cn(FORM_TEXTAREA, FORM_FIELD_FILL)}
          />
        </FormField>
      </FormDialogContent>
      <DiscardChangesDialog guard={guard} />
    </Dialog>
  );
}
