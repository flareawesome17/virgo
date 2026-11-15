import { ScrollView, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { DetailFallback } from '@/components/DetailFallback';
import { InsetFrame } from '@/components/InsetFrame';
import {
  useAuth,
  useCreateScheduleEvent,
  useInviteToEvent,
  useScheduleEvent,
  useUpdateScheduleEvent,
  useWorkspaces,
} from '@/src/hooks';
import { router, useLocalSearchParams } from 'expo-router';
import { useDiscardGuard } from '@/src/lib/discard-guard';
import { FormHeader } from '@/components/FormHeader';
import { useEffect, useRef, useState } from 'react';
import {
  TagIcon, ScissorsIcon, EyeIcon, PackageIcon, PresentationIcon,
  CalendarDaysIcon, ClockIcon, FolderIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { DateTimeField, InvitePeoplePicker } from '@/components';
import { LocationField } from '@/components/LocationField';
import {
  ChoiceChip, ChoiceChips, FormCard, FormField, FormFooter, FormHint, FormInput, FormRow, FormSection,
  FormSwitchRow,
} from '@/components/Form';
import { ChoiceSheet } from '@/components/WorkspaceBits';
import type { EventType } from '@/src/api';
import {
  combineDateAndTime,
  dateToKey,
  dateToTimeString,
  parseDateKey,
} from '@/src/lib/calendar';
import { useHoldUpdates } from '@/src/lib/ota-updates';

cssInterop(TagIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ScissorsIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(EyeIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(PackageIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(PresentationIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CalendarDaysIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ClockIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

const EVENT_TYPES: { key: EventType; label: string; icon: typeof TagIcon }[] = [
  { key: 'event', label: 'Event', icon: CalendarDaysIcon },
  { key: 'editing', label: 'Editing', icon: ScissorsIcon },
  { key: 'review', label: 'Review', icon: EyeIcon },
  { key: 'delivery', label: 'Delivery', icon: PackageIcon },
  { key: 'meeting', label: 'Meeting', icon: PresentationIcon },
  { key: 'other', label: 'Others', icon: TagIcon },
];

/** Matches the column, so a longer label cannot be typed and then rejected. */
const OTHER_LABEL_MAX = 40;

/** The sheet's value for no workspace: it chooses among strings. */
const NO_WORKSPACE = 'none';


export default function CreateEventScreen() {
  // A code fetched from email, or a form half filled: see useHoldUpdates.
  useHoldUpdates();
  // workspaceId arrives when this is opened from a workspace's quick actions,
  // so that workspace starts selected. eventId turns the same form into an
  // edit — the field set is identical, so a second screen would only be this
  // one with a different mutation on the end.
  const {
    date: initialDate,
    workspaceId: initialWorkspaceId,
    eventId,
  } = useLocalSearchParams<{
    date?: string;
    workspaceId?: string;
    eventId?: string;
  }>();
  const { user } = useAuth();
  const editing = Boolean(eventId);

  const [eventType, setEventType] = useState<EventType>('event');
  const [otherLabel, setOtherLabel] = useState('');
  const [location, setLocation] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  // One Date backs both pickers. The screen used to hold two hand-typed
  // strings, which could disagree or be malformed.
  const [when, setWhen] = useState(() => {
    const base = initialDate ? parseDateKey(initialDate) : new Date();
    base.setHours(9, 0, 0, 0);
    return base;
  });
  // Whether this event has a time at all. Creating always does — the picker
  // gives one. Editing an all-day event made on web must not silently acquire
  // 9:00 just because the picker has to show something.
  const [hasTime, setHasTime] = useState(true);
  const [selectedWsId, setSelectedWsId] = useState<string | null>(
    initialWorkspaceId ?? null,
  );
  const [showWsPicker, setShowWsPicker] = useState(false);
  const [guests, setGuests] = useState<string[]>([]);

  const {
    data: existing,
    error: existingError,
    isError: existingFailed,
    isPaused: existingPaused,
    refetch: refetchExisting,
  } = useScheduleEvent(eventId ?? undefined);

  // Once per event, not on every refetch: React Query refreshing in the
  // background must not overwrite what is being typed.
  const prefilledFor = useRef<string | null>(null);
  useEffect(() => {
    if (!existing || prefilledFor.current === existing.id) return;
    prefilledFor.current = existing.id;
    setEventType(existing.event_type);
    setOtherLabel(existing.event_type_other ?? '');
    setLocation(existing.location ?? '');
    setTitle(existing.title);
    setDescription(existing.description ?? '');
    setHasTime(Boolean(existing.event_time));
    setWhen(
      existing.event_time
        ? combineDateAndTime(existing.event_date, existing.event_time)
        : (() => {
            const base = parseDateKey(existing.event_date);
            base.setHours(9, 0, 0, 0);
            return base;
          })(),
    );
    setSelectedWsId(existing.workspace_id ?? null);
  }, [existing]);

  // Archived ones too, so an event already filed under one still shows it.
  const { allowLeave } = useDiscardGuard(
    { eventType, otherLabel, location, title, description, when: when.getTime(), hasTime, guests },
    !editing || (!!existing && prefilledFor.current === existing.id),
  );

  const { workspaces: listed } = useWorkspaces(
    { orderBy: 'name', direction: 'asc', limit: 100, archived: 'include' },
    { enabled: !!user?.id },
  );

  const selectedWs = listed.find((w) => w.id === selectedWsId);

  // Offered: your own, in use. An event is filed under a workspace the way an
  // album is, and only its owner can — one shared with you ended in "Unknown
  // workspace" when you saved.
  const workspaces = listed.filter((w) => w.user_id === user?.id && !w.archived_at);

  /**
   * Editing an event somebody else created.
   *
   * Anyone on an event may change what it is, but not where it is filed — a
   * workspace belongs to the organiser, and the API refuses the field from
   * anyone else. Showing the picker anyway would be offering a control that
   * always fails.
   *
   * Undefined while the event is still loading, and on a create, both of which
   * are "yours" as far as this is concerned.
   */
  const guestEdit = editing && existing?.is_owner === false;
  // An "Others" event is only half-described until it is named, so Save waits
  // for the name the way it already waits for the title.
  const canSave =
    title.trim().length > 0 &&
    (eventType !== 'other' || otherLabel.trim().length > 0);

  // Sent on every save, not only when Others is chosen: switching away from it
  // has to clear the old name, and omitting the field leaves the server to
  // guess whether that was meant.
  const typeFields = {
    event_type: eventType,
    event_type_other: eventType === 'other' ? otherLabel.trim() : null,
    // Null rather than '' when cleared, so "has a location" stays one check.
    // The server settles the spelling — "cebu" comes back as "Cebu City".
    location: location.trim() || null,
  };

  const createEvent = useCreateScheduleEvent();
  const updateEvent = useUpdateScheduleEvent();
  const inviteToEvent = useInviteToEvent();
  const saving = editing
    ? updateEvent.isPending
    : createEvent.isPending || inviteToEvent.isPending;

  const handleUpdate = () => {
    if (!eventId) return;
    updateEvent.mutate(
      {
        id: eventId,
        title: title.trim(),
        description: description.trim() || null,
        event_date: dateToKey(when),
        event_time: hasTime ? dateToTimeString(when) : null,
        ...typeFields,
        // Unlike create, null is meaningful here: it detaches the workspace.
        // Omitted for a guest: they may not set it, and sending the value
        // unchanged would still be a field the server refuses.
        ...(guestEdit ? {} : { workspace_id: selectedWsId }),
      },
      {
        onSuccess: () => {
          allowLeave();
          router.back();
        },
        onError: (err: any) =>
          Alert.alert(
            'Could not save the event',
            err?.message || 'Something went wrong. Please try again.',
          ),
      },
    );
  };

  const handleCreate = () => {
    createEvent.mutate(
      {
        title: title.trim(),
        description: description.trim() || null,
        event_date: dateToKey(when),
        event_time: dateToTimeString(when),
        ...typeFields,
        // Omitted rather than null when unset: the API rejects an explicit null
        // for an optional string, and a missing key simply leaves it NULL.
        ...(selectedWsId ? { workspace_id: selectedWsId } : {}),
      },
      {
        onSuccess: async (event) => {
          // A second call on purpose: the event exists either way, so a failure
          // here costs the invitations, not the event. The detail screen the
          // user lands on shows who was actually invited.
          //
          // Awaited before leaving. It was fired and then the screen replaced
          // at once, and a mutation's own callbacks do not run once the screen
          // that made it is gone — so this alert could never appear, and a
          // failed invitation went unmentioned.
          if (guests.length > 0) {
            try {
              await inviteToEvent.mutateAsync({ eventId: event.id, userIds: guests });
            } catch (err: any) {
              Alert.alert(
                'Event created, but the invitations failed',
                err?.message || 'Try inviting them from the event.',
              );
            }
          }
          allowLeave();
          router.replace(`/schedule/${event.id}`);
        },
        // Show what actually went wrong. A flat "Could not create event"
        // hides the difference between a validation problem, an expired
        // session and the server being unreachable — all of which need a
        // different response from the user.
        onError: (err: any) =>
          Alert.alert(
            'Could not create event',
            err?.message || 'Something went wrong. Please try again.',
          ),
      },
    );
  };

  // Editing opened on an empty form, as if creating, until the event arrived
  // — and stayed that way when it did not.
  if (editing && !existing) {
    return (
      <DetailFallback
        title="Edit event"
        what="this event"
        gone="It was deleted, or you were taken off it."
        error={existingError}
        failed={existingFailed || existingPaused}
        onRetry={() => void refetchExisting()}
      />
    );
  }

  return (
    <InsetFrame edges={['top']}>
      <FormHeader title={editing ? 'Edit event' : 'New event'} />
      {/* Lifts the form above the keyboard. Without this the fields nearest
          the bottom sat underneath it on iOS with no way to scroll to them. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView
          keyboardDismissMode="on-drag"
          className="flex-1"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 20, paddingBottom: 32, gap: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* What it is, first: it was third, under a row of chips. */}
          <FormField label="What is it?">
            <FormInput
              value={title}
              onChangeText={setTitle}
              placeholder="Prenup shoot, Ana & Marco"
              autoFocus={!editing}
              returnKeyType="done"
            />
          </FormField>

          <FormField label="Kind">
            <ChoiceChips>
              {EVENT_TYPES.map((t) => (
                <ChoiceChip
                  key={t.key}
                  label={t.label}
                  icon={t.icon}
                  selected={eventType === t.key}
                  onPress={() => setEventType(t.key)}
                />
              ))}
            </ChoiceChips>
            {eventType === 'other' && (
              <FormInput
                value={otherLabel}
                onChangeText={setOtherLabel}
                placeholder="Client viewing"
                maxLength={OTHER_LABEL_MAX}
                accessibilityLabel="What kind of event"
              />
            )}
          </FormField>

          {/* Date & Time — native pickers. These were free-text fields that
              required typing YYYY-MM-DD and HH:MM by hand. */}
          <FormSection title="When">
            <FormCard>
              <DateTimeField row first label="Date" mode="date" value={when} onChange={(next) => next && setWhen(next)} />
              {hasTime && (
                <DateTimeField
                  row
                  label="Time"
                  mode="time"
                  value={when}
                  onChange={(next) => {
                    if (!next) return;
                    setWhen(next);
                    setHasTime(true);
                  }}
                />
              )}
              {/* All day, said and chosen. Only an event made on the web
                  could be one; here every new event got 9:00 whether it had a
                  time or not. */}
              <FormSwitchRow
                icon={ClockIcon}
                label="All day"
                value={!hasTime}
                onValueChange={(allDay) => setHasTime(!allDay)}
              />
            </FormCard>
          </FormSection>

          <FormField label="Where" optional>
            <LocationField form value={location} onChange={setLocation} placeholder="Cebu City, or the venue" />
          </FormField>

          {/* Workspace — the organiser's to decide, so hidden when editing
              somebody else's event rather than shown and rejected. */}
          {!guestEdit && (
            <FormCard>
              <FormRow
                first
                icon={FolderIcon}
                label="Workspace"
                value={selectedWs ? selectedWs.name : 'None'}
                empty={!selectedWs}
                onPress={() => setShowWsPicker(true)}
              />
            </FormCard>
          )}

          {guestEdit && (
            <FormHint>
              This is not your event. The organiser and everyone going will be told what you change.
            </FormHint>
          )}

          {/* Invitations. Absent when editing: an existing event manages its
              guests from the detail screen, which can also uninvite. */}
          {!editing && (
            <FormField
              label={guests.length > 0 ? `Invite · ${guests.length} chosen` : 'Invite'}
              optional={guests.length === 0}
              hint="They choose whether to join. Accepting puts it on their calendar."
            >
              <InvitePeoplePicker selected={guests} onChange={setGuests} />
            </FormField>
          )}

          <FormField label="Notes" optional>
            <FormInput
              value={description}
              onChangeText={setDescription}
              placeholder="What to bring, where to park…"
              multiline
            />
          </FormField>

          {editing && <FormHint>Anyone who accepted sees these changes on their own calendar.</FormHint>}
        </ScrollView>

        {/* One button. There was a Cancel beside it, and an X above that
            already did the same thing. */}
        <FormFooter
          label={editing ? 'Save changes' : 'Create event'}
          onPress={() => (editing ? handleUpdate() : handleCreate())}
          disabled={!canSave}
          busy={saving}
        />
      </KeyboardAvoidingView>

      <ChoiceSheet
        visible={showWsPicker}
        title="Workspace"
        hint="File this event under one of your workspaces."
        options={[{ value: NO_WORKSPACE, label: 'None' }, ...workspaces.map((w) => ({ value: w.id, label: w.name }))]}
        value={selectedWsId ?? NO_WORKSPACE}
        onChoose={(next) => setSelectedWsId(next === NO_WORKSPACE ? null : next)}
        onClose={() => setShowWsPicker(false)}
      />
    </InsetFrame>
  );
}
