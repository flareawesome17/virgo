import { View, Text, ScrollView, RefreshControl, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useDeleteScheduleEvent,
  useReminders,
  useScheduleEvent,
  useTheme,
  useUpdateReminder,
  useWorkspace,
} from '@/src/hooks';
import { EventAttendeesSection } from '@/components';
import { useLocalSearchParams, router } from 'expo-router';
import { useState } from 'react';
import {
  ArrowLeftIcon, ClockIcon, CalendarDaysIcon, MapPinIcon, BellIcon, BellOffIcon,
  TagIcon, ScissorsIcon, EyeIcon, PackageIcon, PresentationIcon,
  CheckCircleIcon, CircleIcon, PlusIcon, Trash2Icon, PencilIcon,
  type LucideIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { eventColor, eventTypeLabel } from '@/src/lib/calendar';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(MapPinIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ClockIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CalendarDaysIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(BellIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(BellOffIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(TagIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ScissorsIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(EyeIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(PackageIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(PresentationIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CheckCircleIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CircleIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(PlusIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(Trash2Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(PencilIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

const EVENT_ICONS: Record<string, LucideIcon> = {
  event: CalendarDaysIcon, editing: ScissorsIcon, review: EyeIcon,
  delivery: PackageIcon, meeting: PresentationIcon, other: TagIcon,
};
function formatTime(timeStr: string | null): string {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':');
  const hour = parseInt(h), ampm = hour >= 12 ? 'PM' : 'AM', h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}
function formatDateFull(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

export default function EventDetailScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const { isDark } = useTheme();
  const [refreshing, setRefreshing] = useState(false);

  // A 404 here now means "not yours or not there" — the API does not
  // distinguish the two, deliberately, so record ids cannot be enumerated.
  const { data: event, refetch: refetchEvent } = useScheduleEvent(eventId);

  const { data: workspace } = useWorkspace(event?.workspace_id ?? undefined);

  const { reminders, refetch: refetchReminders } = useReminders(
    { schedule_event_id: eventId, orderBy: 'reminder_time', direction: 'asc' },
    { enabled: !!eventId },
  );

  const updateReminder = useUpdateReminder();
  const toggleReminder = (id: string, is_completed: boolean) =>
    updateReminder.mutate({ id, is_completed });

  const deleteEventMutation = useDeleteScheduleEvent();

  /**
   * Confirm first.
   *
   * This deleted on the first tap, with no undo and no trace. On a phone that
   * is one mis-aimed thumb between a booking and losing it — along with every
   * invitation attached to it, which is the part the organiser cannot rebuild
   * by remembering harder.
   *
   * Names the event and says who else loses it, because "Are you sure?" on its
   * own is a question nobody reads.
   */
  const confirmDelete = () => {
    Alert.alert(
      'Delete event',
      `"${event?.title ?? 'This event'}" will be removed from your schedule and from the calendar of everyone who accepted. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            deleteEventMutation.mutate(eventId, {
              onSuccess: () => router.back(),
              onError: (err: Error) =>
                Alert.alert(
                  'Could not delete the event',
                  err.message || 'Please try again.',
                ),
            }),
        },
      ],
    );
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchEvent(), refetchReminders()]);
    setRefreshing(false);
  };

  if (!event) {
    return <SafeAreaView edges={['top']} className="flex-1 bg-background"><View className="flex-1 items-center justify-center"><Text className="text-muted-foreground text-sm">Loading...</Text></View></SafeAreaView>;
  }

  const color = eventColor(event.event_type);
  const IconComp = EVENT_ICONS[event.event_type] || CalendarDaysIcon;
  const wsAccent = workspace?.accent_color || color;
  // Undefined on a just-created event, which is always yours.
  const isOwner = event.is_owner !== false;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={isDark ? '#C17745' : '#B66A40'} />}>

        {/* Hero color block */}
        <View style={{ backgroundColor: `${color}14`, paddingTop: 4, paddingBottom: 24, paddingHorizontal: 20 }}>
          <Pressable onPress={() => router.back()} className="w-10 h-10 rounded-2xl bg-white items-center justify-center mb-4 active:scale-[0.94]"
            style={{ shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
            <ArrowLeftIcon size={18} color="#1E1B18" />
          </Pressable>
          <View className="flex-row items-center gap-4">
            <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: `${color}22`, alignItems: 'center', justifyContent: 'center' }}>
              <IconComp size={26} color={color} />
            </View>
            <View className="flex-1">
              <Text className="text-foreground text-[20px] font-bold tracking-tight">{event.title}</Text>
              <View className="flex-row items-center gap-2 mt-1.5">
                <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: `${color}22` }}>
                  <Text numberOfLines={1} style={{ color, fontSize: 11, fontWeight: '700', textTransform: event.event_type_other ? 'none' : 'uppercase', letterSpacing: 0.4 }}>{eventTypeLabel(event)}</Text>
                </View>
                {workspace && (
                  <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: `${wsAccent}15` }}>
                    <Text style={{ color: wsAccent, fontSize: 11, fontWeight: '600' }}>{workspace.name}</Text>
                  </View>
                )}
                {!isOwner && (
                  <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: '#5B7B9A18' }}>
                    <Text style={{ color: '#5B7B9A', fontSize: 11, fontWeight: '600' }}>Guest</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        </View>

        {/* Details card */}
        <View className="mx-5 -mt-3 bg-card rounded-2xl p-4 flex-row items-center gap-4" style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 3 }}>
          <View className="flex-row items-center gap-2 flex-1">
            <CalendarDaysIcon size={14} color={color} />
            <View>
              <Text className="text-muted-foreground text-[10px] font-semibold uppercase">Date</Text>
              <Text className="text-foreground text-sm font-bold">{formatDateFull(event.event_date)}</Text>
            </View>
          </View>
          {event.event_time && (
            <View className="flex-row items-center gap-2">
              <ClockIcon size={14} color={color} />
              <View>
                <Text className="text-muted-foreground text-[10px] font-semibold uppercase">Time</Text>
                <Text className="text-foreground text-sm font-bold">{formatTime(event.event_time)}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Where */}
        {event.location && (
          <View className="mx-5 mt-4 bg-card rounded-2xl p-4 flex-row items-center gap-3" style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
            <MapPinIcon size={14} color={color} />
            <View className="flex-1 min-w-0">
              <Text className="text-muted-foreground text-[10px] font-semibold uppercase">Where</Text>
              <Text className="text-foreground text-sm font-bold">{event.location}</Text>
            </View>
          </View>
        )}

        {/* Description */}
        {event.description && (
          <View className="mx-5 mt-4 bg-card rounded-2xl p-4" style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
            <Text className="text-muted-foreground text-[10px] font-bold uppercase tracking-[1.5px] mb-2">Description</Text>
            <Text className="text-foreground text-sm leading-relaxed">{event.description}</Text>
          </View>
        )}

        {/* Attendees — only the organiser can change who is invited. */}
        {isOwner && <EventAttendeesSection eventId={eventId} />}

        {/* Reminders */}
        <View className="px-5 mt-5">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-foreground text-base font-bold tracking-tight">Reminders</Text>
            <Pressable onPress={() => router.push(`/schedule/reminders/create?eventId=${eventId}`)} className="flex-row items-center gap-1 active:opacity-60">
              <PlusIcon size={13} className="text-primary" />
              <Text className="text-primary text-sm font-semibold">Add</Text>
            </Pressable>
          </View>
          {reminders.length === 0 ? (
            <View className="bg-card rounded-2xl p-6 items-center gap-2">
              <BellIcon size={18} className="text-muted-foreground" />
              <Text className="text-muted-foreground text-sm">No reminders set</Text>
            </View>
          ) : (
            <View className="bg-card rounded-2xl overflow-hidden" style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
              {reminders.map((rem, i) => (
                <Pressable key={rem.id} onPress={() => router.push(`/schedule/reminders/${rem.id}`)}
                  className="flex-row items-center gap-3 px-4 py-3 active:bg-muted/30"
                  style={i < reminders.length - 1 ? { borderBottomWidth: 1, borderBottomColor: isDark ? '#2A2522' : '#F0E8E2' } : undefined}>
                  <Pressable onPress={() => toggleReminder(rem.id, !rem.is_completed)} className="active:scale-[0.85]">
                    {rem.is_completed ? <CheckCircleIcon size={18} className="text-[#6B8E4E]" /> : <CircleIcon size={18} className="text-muted-foreground" />}
                  </Pressable>
                  <View className="flex-1 min-w-0">
                    <Text className={`text-sm font-semibold ${rem.is_completed ? 'text-muted-foreground line-through' : 'text-foreground'}`} numberOfLines={1}>{rem.title}</Text>
                    <View className="flex-row items-center gap-2 mt-0.5">
                      <Text className="text-muted-foreground text-xs">{formatTime(new Date(rem.reminder_time).toTimeString().slice(0, 5))}</Text>
                      {rem.is_alarm_enabled && <BellIcon size={9} className="text-primary" />}
                      {rem.has_push_notification && <View style={{ paddingHorizontal: 3, paddingVertical: 1, borderRadius: 3, backgroundColor: '#5B7B9A18' }}><Text style={{ color: '#5B7B9A', fontSize: 7, fontWeight: '700' }}>PUSH</Text></View>}
                    </View>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* Edit is open to anyone on the event: if this screen loaded at all
            you either own it or accepted an invitation to it, which is exactly
            who the API lets write. Delete stays with whoever created it — it
            cannot be undone, and it takes the event off everybody's calendar.

            Edit reuses the create form, which carries exactly the fields the
            API accepts on a PATCH. */}
        <View className="px-5 mt-8">
          <Pressable
            onPress={() => router.push({ pathname: '/schedule/create', params: { eventId } })}
            className="flex-row items-center justify-center gap-2 py-3 rounded-2xl bg-card active:scale-[0.97]"
            style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}
          >
            <PencilIcon size={15} className="text-primary" />
            <Text className="text-primary text-sm font-semibold">Edit Event</Text>
          </Pressable>
          {!isOwner && (
            <Text className="text-muted-foreground text-[11px] text-center mt-2 leading-4">
              This is not your event. The organiser and everyone going will be
              told what you change.
            </Text>
          )}
          {isOwner && (
            <Pressable onPress={confirmDelete} className="flex-row items-center justify-center gap-2 py-3 mt-2 active:scale-[0.97]">
              <Trash2Icon size={15} className="text-destructive" />
              <Text className="text-destructive text-sm font-semibold">Delete Event</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
