import { View, Text, ScrollView, Pressable, TextInput, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useAuth,
  useCreateScheduleEvent,
  useInviteToEvent,
  useScheduleEvent,
  useUpdateScheduleEvent,
  useWorkspaces,
  useTheme,
} from '@/src/hooks';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeftIcon, TagIcon, ScissorsIcon, EyeIcon, PackageIcon, PresentationIcon,
  CalendarDaysIcon, ClockIcon, CheckIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { DateTimeField, InvitePeoplePicker } from '@/components';
import type { EventType } from '@/src/api';
import {
  combineDateAndTime,
  dateToKey,
  dateToTimeString,
  parseDateKey,
} from '@/src/lib/calendar';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(TagIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ScissorsIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(EyeIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(PackageIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(PresentationIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CalendarDaysIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ClockIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CheckIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

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


export default function CreateEventScreen() {
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
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

  const { data: existing } = useScheduleEvent(eventId ?? undefined);

  // Once per event, not on every refetch: React Query refreshing in the
  // background must not overwrite what is being typed.
  const prefilledFor = useRef<string | null>(null);
  useEffect(() => {
    if (!existing || prefilledFor.current === existing.id) return;
    prefilledFor.current = existing.id;
    setEventType(existing.event_type);
    setOtherLabel(existing.event_type_other ?? '');
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

  const { workspaces } = useWorkspaces(
    { orderBy: 'name', direction: 'asc', limit: 100 },
    { enabled: !!user?.id },
  );

  const selectedWs = workspaces.find((w) => w.id === selectedWsId);

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
  };

  const createEvent = useCreateScheduleEvent();
  const updateEvent = useUpdateScheduleEvent();
  const inviteToEvent = useInviteToEvent();
  const saving = editing ? updateEvent.isPending : createEvent.isPending;

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
        onSuccess: () => router.back(),
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
        onSuccess: (event) => {
          // A second call on purpose: the event exists either way, so a failure
          // here costs the invitations, not the event. The detail screen the
          // user lands on shows who was actually invited.
          if (guests.length > 0) {
            inviteToEvent.mutate(
              { eventId: event.id, userIds: guests },
              {
                onError: (err: any) =>
                  Alert.alert(
                    'Event created, but the invitations failed',
                    err?.message || 'Try inviting them from the event.',
                  ),
              },
            );
          }
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

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      {/* Lifts the form above the keyboard. Without this the fields nearest
          the bottom sat underneath it on iOS with no way to scroll to them. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        <View className="px-5 pt-4 pb-2 flex-row items-center gap-3">
          <Pressable onPress={() => router.back()} className="w-10 h-10 rounded-2xl bg-card items-center justify-center active:scale-[0.94]"
            style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
            <ArrowLeftIcon size={18} className="text-foreground" />
          </Pressable>
          <Text className="text-foreground text-[22px] font-bold tracking-tight">{editing ? 'Edit Event' : 'New Event'}</Text>
        </View>

        {/* Event Type */}
        <View className="px-5 mt-5">
          <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-3 ml-1">Event Type</Text>
          <View className="flex-row flex-wrap gap-2">
            {EVENT_TYPES.map(t => {
              const Icon = t.icon;
              return (
                <Pressable key={t.key} onPress={() => setEventType(t.key)}
                  className={`rounded-xl px-4 py-2.5 flex-row items-center gap-2 active:scale-[0.96] ${eventType === t.key ? 'bg-primary' : 'bg-card'}`}
                  style={eventType !== t.key ? { shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 } : undefined}>
                  <Icon size={14} className={eventType === t.key ? 'text-white' : 'text-foreground'} />
                  <Text className={`text-sm font-semibold ${eventType === t.key ? 'text-white' : 'text-foreground'}`}>{t.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {eventType === 'other' && (
            <TextInput
              value={otherLabel}
              onChangeText={setOtherLabel}
              placeholder="e.g. Client viewing"
              placeholderTextColor="#A89489"
              maxLength={OTHER_LABEL_MAX}
              className="bg-card rounded-2xl px-4 py-3.5 text-foreground text-base mt-3"
              style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}
            />
          )}
        </View>

        {/* Title */}
        <View className="px-5 mt-5">
          <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">Title</Text>
          <TextInput value={title} onChangeText={setTitle} placeholder="e.g. Look 2 — Studio Session" placeholderTextColor="#A89489"
            className="bg-card rounded-2xl px-4 py-3.5 text-foreground text-base" style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }} autoFocus />
        </View>

        {/* Description */}
        <View className="px-5 mt-4">
          <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">Description <Text className="font-medium normal-case tracking-normal">(optional)</Text></Text>
          <TextInput value={description} onChangeText={setDescription} placeholder="Details, location, notes..." placeholderTextColor="#A89489"
            multiline numberOfLines={3} textAlignVertical="top"
            className="bg-card rounded-2xl px-4 py-3.5 text-foreground text-base" style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2, minHeight: 72 }} />
        </View>

        {/* Date & Time — native pickers. These were free-text fields that
            required typing YYYY-MM-DD and HH:MM by hand. */}
        <View className="px-5 mt-5 flex-row gap-3">
          <DateTimeField
            label="Date"
            mode="date"
            value={when}
            onChange={(next) => setWhen(next)}
          />
          <DateTimeField
            // Says so rather than showing a plausible-looking 9:00 for an
            // all-day event. Touching the picker is what gives it a time.
            label={hasTime ? 'Time' : 'Time (not set)'}
            mode="time"
            value={when}
            onChange={(next) => {
              setWhen(next);
              setHasTime(true);
            }}
          />
        </View>

        {/* Workspace — the organiser's to decide, so hidden when editing
            somebody else's event rather than shown and rejected. */}
        {!guestEdit && (
        <View className="px-5 mt-5">
          <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">Workspace <Text className="font-medium normal-case tracking-normal">(optional)</Text></Text>
          <Pressable onPress={() => setShowWsPicker(!showWsPicker)}
            className="bg-card rounded-2xl px-4 py-3.5 flex-row items-center gap-3 active:scale-[0.98]"
            style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
            {selectedWs ? (
              <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: `${selectedWs.accent_color}22`, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: selectedWs.accent_color }}>{selectedWs.name.charAt(0)}</Text>
              </View>
            ) : null}
            <Text className="text-foreground text-sm flex-1">{selectedWs ? selectedWs.name : 'None'}</Text>
          </Pressable>
          {showWsPicker && (
            <View className="mt-2 bg-card rounded-2xl overflow-hidden" style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
              <Pressable onPress={() => { setSelectedWsId(null); setShowWsPicker(false); }} className="px-4 py-3 active:bg-muted/30 flex-row items-center gap-3" style={{ borderBottomWidth: 1, borderBottomColor: isDark ? '#2A2522' : '#F0E8E2' }}>
                <Text className="text-muted-foreground text-sm flex-1">None</Text>
                {!selectedWsId && <CheckIcon size={14} className="text-primary" />}
              </Pressable>
              {workspaces.map(w => (
                <Pressable key={w.id} onPress={() => { setSelectedWsId(w.id); setShowWsPicker(false); }} className="px-4 py-3 active:bg-muted/30 flex-row items-center gap-3">
                  <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: `${w.accent_color}22`, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: w.accent_color }}>{w.name.charAt(0)}</Text>
                  </View>
                  <Text className="text-foreground text-sm flex-1">{w.name}</Text>
                  {w.id === selectedWsId && <CheckIcon size={14} className="text-primary" />}
                </Pressable>
              ))}
            </View>
          )}
        </View>
        )}

        {guestEdit && (
          <View className="px-5 mt-5">
            <Text className="text-muted-foreground text-xs leading-4">
              This is not your event. The organiser and everyone going will be
              told what you change.
            </Text>
          </View>
        )}

        {/* Invitations. Absent when editing: an existing event manages its
            guests from the detail screen, which can also uninvite. */}
        {!editing && (
          <View className="px-5 mt-5">
            <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">
              Invite{' '}
              <Text className="font-medium normal-case tracking-normal">
                {guests.length > 0 ? `(${guests.length} selected)` : '(optional)'}
              </Text>
            </Text>
            <Text className="text-muted-foreground text-xs mb-2 ml-1">
              They choose whether to join. Accepting puts it on their calendar.
            </Text>
            <InvitePeoplePicker selected={guests} onChange={setGuests} />
          </View>
        )}

        {editing && (
          <View className="px-5 mt-5">
            <Text className="text-muted-foreground text-xs ml-1">
              Anyone who accepted sees these changes on their own calendar.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Bottom actions */}
      <View className="absolute bottom-0 left-0 right-0 px-5 pt-4 bg-background flex-row gap-3" style={{ paddingBottom: insets.bottom + 16 }}>
        <Pressable onPress={() => router.back()} className="flex-1 bg-card rounded-2xl py-3.5 items-center active:scale-[0.97]"
          style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
          <Text className="text-foreground text-base font-semibold">Back</Text>
        </Pressable>
        <Pressable onPress={() => canSave && (editing ? handleUpdate() : handleCreate())} className={`flex-[2] rounded-2xl py-3.5 items-center active:scale-[0.97] ${canSave ? 'bg-primary' : 'bg-muted'}`} disabled={!canSave || saving}>
          <Text className={`text-base font-bold ${canSave ? 'text-white' : 'text-muted-foreground'}`}>
            {saving ? (editing ? 'Saving...' : 'Creating...') : editing ? 'Save Changes' : 'Create Event'}
          </Text>
        </Pressable>
      </View>
          </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
