import { View, Text, ScrollView, Pressable, TextInput, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useAuth,
  useCreateScheduleEvent,
  useInviteToEvent,
  useWorkspaces,
  useTheme,
} from '@/src/hooks';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ArrowLeftIcon, CameraIcon, ScissorsIcon, EyeIcon, PackageIcon, PresentationIcon,
  CalendarDaysIcon, ClockIcon, CheckIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { DateTimeField, InvitePeoplePicker } from '@/components';
import { dateToKey, dateToTimeString, parseDateKey } from '@/src/lib/calendar';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CameraIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ScissorsIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(EyeIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(PackageIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(PresentationIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CalendarDaysIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ClockIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CheckIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

const EVENT_TYPES = [
  { key: 'shoot', label: 'Shoot', icon: CameraIcon, color: '#B66A40' },
  { key: 'editing', label: 'Editing', icon: ScissorsIcon, color: '#C17745' },
  { key: 'review', label: 'Review', icon: EyeIcon, color: '#8B5E3C' },
  { key: 'delivery', label: 'Delivery', icon: PackageIcon, color: '#6B8E4E' },
  { key: 'meeting', label: 'Meeting', icon: PresentationIcon, color: '#5B7B9A' },
];


export default function CreateEventScreen() {
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  // workspaceId arrives when this is opened from a workspace's quick actions,
  // so that workspace starts selected.
  const { date: initialDate, workspaceId: initialWorkspaceId } =
    useLocalSearchParams<{ date?: string; workspaceId?: string }>();
  const { user } = useAuth();

  const [eventType, setEventType] = useState('shoot');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  // One Date backs both pickers. The screen used to hold two hand-typed
  // strings, which could disagree or be malformed.
  const [when, setWhen] = useState(() => {
    const base = initialDate ? parseDateKey(initialDate) : new Date();
    base.setHours(9, 0, 0, 0);
    return base;
  });
  const [selectedWsId, setSelectedWsId] = useState<string | null>(
    initialWorkspaceId ?? null,
  );
  const [showWsPicker, setShowWsPicker] = useState(false);
  const [guests, setGuests] = useState<string[]>([]);

  const { workspaces } = useWorkspaces(
    { orderBy: 'name', direction: 'asc', limit: 100 },
    { enabled: !!user?.id },
  );

  const selectedWs = workspaces.find((w) => w.id === selectedWsId);
  const canSave = title.trim().length > 0;

  const createEvent = useCreateScheduleEvent();
  const inviteToEvent = useInviteToEvent();

  const handleCreate = () => {
    createEvent.mutate(
      {
        title: title.trim(),
        description: description.trim() || null,
        event_date: dateToKey(when),
        event_time: dateToTimeString(when),
        event_type: eventType as 'shoot' | 'editing' | 'review' | 'delivery' | 'meeting',
        // Omitted rather than null when unset: the API rejects an explicit null
        // for an optional string, and a missing key simply leaves it NULL.
        ...(selectedWsId ? { workspace_id: selectedWsId } : {}),
      },
      {
        onSuccess: (event) => {
          // A second call on purpose: the event exists either way, so a failure
          // here costs the invitations, not the shoot. The detail screen the
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

  const activeType = EVENT_TYPES.find(t => t.key === eventType) || EVENT_TYPES[0];

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
          <Text className="text-foreground text-[22px] font-bold tracking-tight">New Event</Text>
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
            label="Time"
            mode="time"
            value={when}
            onChange={(next) => setWhen(next)}
          />
        </View>

        {/* Workspace */}
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

        {/* Invitations */}
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
      </ScrollView>

      {/* Bottom actions */}
      <View className="absolute bottom-0 left-0 right-0 px-5 pt-4 bg-background flex-row gap-3" style={{ paddingBottom: insets.bottom + 16 }}>
        <Pressable onPress={() => router.back()} className="flex-1 bg-card rounded-2xl py-3.5 items-center active:scale-[0.97]"
          style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
          <Text className="text-foreground text-base font-semibold">Back</Text>
        </Pressable>
        <Pressable onPress={() => canSave && handleCreate()} className={`flex-[2] rounded-2xl py-3.5 items-center active:scale-[0.97] ${canSave ? 'bg-primary' : 'bg-muted'}`} disabled={!canSave || createEvent.isPending}>
          <Text className={`text-base font-bold ${canSave ? 'text-white' : 'text-muted-foreground'}`}>{createEvent.isPending ? 'Creating...' : 'Create Event'}</Text>
        </Pressable>
      </View>
          </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
