import { View, Text, ScrollView, RefreshControl, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import {
  useDeleteScheduleEvent,
  useRespondToEventInvitation,
  useReminders,
  useScheduleEvent,
  useTheme,
  useUpdateReminder,
  useWorkspace,
} from '@/src/hooks';
import { EventAttendeesSection } from '@/components';
import { DetailFallback } from '@/components/DetailFallback';
import { goBackOr } from '@/components/ScreenHeader';
import { useLocalSearchParams, router } from 'expo-router';
import { useState } from 'react';
import {
  ArrowLeftIcon, ClockIcon, MapPinIcon, BellIcon, BellOffIcon, FolderIcon,
  CheckCircleIcon, CircleIcon, ChevronRightIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import {
  combineDateAndTime,
  eventColor,
  eventTypeLabel,
  formatTime,
  parseDateKey,
} from '@/src/lib/calendar';
import { PALETTES } from '@/theme';

for (const Icon of [
  ArrowLeftIcon, ClockIcon, MapPinIcon, BellIcon, BellOffIcon, FolderIcon,
  CheckCircleIcon, CircleIcon, ChevronRightIcon,
]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/** The one card, as on the Dashboard and the Schedule. */
const CARD = 'bg-card rounded-[20px] border border-border/40 overflow-hidden';
const TITLE = 'text-foreground text-[17px] leading-6 font-bold tracking-tight';
const LINK = 'text-primary text-[14px] font-semibold';

// As a local calendar day: new Date('2027-01-10') is UTC midnight, which is
// the day before anywhere west of Greenwich.
function formatDateFull(dateStr: string): string {
  return parseDateKey(dateStr.slice(0, 10)).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

/** "in 40 min", "in 14 h" — only inside the next day, and only with a time. */
function startsIn(date: string, time: string | null, now = new Date()): string | null {
  if (!time) return null;
  const minutes = Math.round((combineDateAndTime(date, time).getTime() - now.getTime()) / 60000);
  if (minutes <= 0 || minutes >= 24 * 60) return null;
  if (minutes < 60) return `in ${minutes} min`;
  return `in ${Math.round(minutes / 60)} h`;
}

/**
 * One event.
 *
 * The day leads, as a tile, beside what it is. Then the facts in one card, a
 * row each: when, where, which workspace. Then the notes at reading size, who
 * is coming, and the reminders.
 *
 * It opened on a band tinted with the event type's colour, an icon tile, and
 * three shadowed cards with 10pt capitals for labels. The colour said the
 * type three times and the date, which is the reason anybody opens an event,
 * was 14pt text in the second card.
 */
export default function EventDetailScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const [refreshing, setRefreshing] = useState(false);

  // A 404 here now means "not yours or not there" — the API does not
  // distinguish the two, deliberately, so record ids cannot be enumerated.
  const {
    data: event,
    refetch: refetchEvent,
    error: eventError,
    isError: eventFailed,
    isPaused: eventPaused,
  } = useScheduleEvent(eventId);

  const { data: workspace } = useWorkspace(event?.workspace_id ?? undefined);

  const { reminders, refetch: refetchReminders } = useReminders(
    { schedule_event_id: eventId, orderBy: 'reminder_time', direction: 'asc' },
    { enabled: !!eventId },
  );

  const updateReminder = useUpdateReminder();
  const toggleReminder = (id: string, is_completed: boolean) =>
    updateReminder.mutate({ id, is_completed });

  const deleteEventMutation = useDeleteScheduleEvent();
  const respond = useRespondToEventInvitation();

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
              onSuccess: () => goBackOr(),
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
    return (
      <DetailFallback
        title="Event"
        what="this event"
        gone="It was deleted, or you are no longer invited."
        error={eventError}
        failed={eventFailed || eventPaused}
        onRetry={() => void refetchEvent()}
      />
    );
  }

  // Undefined on a just-created event, which is always yours.
  const isOwner = event.is_owner !== false;
  /*
   * A guest who accepted could not back out: the event sat on their calendar
   * with no way off it short of asking the organiser to remove them. The API
   * already takes a decline after an accept; this is the button for it.
   */
  const cantMakeIt = () =>
    Alert.alert("Can't make it?", 'The organiser is told, and the event leaves your schedule.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: "Can't make it",
        style: 'destructive',
        onPress: () =>
          respond.mutate(
            { eventId: event.id, accept: false },
            {
              onSuccess: () => goBackOr('/(app)/(tabs)/schedule'),
              onError: (err: any) =>
                Alert.alert('Could not change that', err?.message || 'Please try again.'),
            },
          ),
      },
    ]);

  const day = parseDateKey(event.event_date.slice(0, 10));
  const countdown = startsIn(event.event_date, event.event_time);
  const location = event.location?.trim() || null;
  // The place as typed, handed to whichever maps app the phone opens links
  // with. It is a search, not a pin: an event has no coordinates.
  const openMap = () => {
    if (!location) return;
    Linking.openURL(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`,
    ).catch(() => Alert.alert('Could not open Maps', 'Please try again.'));
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      {/* Back, and Edit where the thumb expects it. Edit is open to anyone on
          the event: if this screen loaded at all you either own it or accepted
          an invitation to it, which is exactly who the API lets write. It
          reuses the create form, which carries the fields a PATCH accepts. */}
      <View className="h-12 flex-row items-center justify-between px-1">
        {/* goBackOr, because a notification can open this screen with nothing
            behind it. */}
        <Pressable
          onPress={() => goBackOr()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          className="w-11 h-11 items-center justify-center active:opacity-60"
        >
          <ArrowLeftIcon size={22} className="text-foreground" />
        </Pressable>
        <Pressable
          onPress={() => router.push({ pathname: '/schedule/create', params: { eventId } })}
          accessibilityRole="button"
          accessibilityLabel="Edit event"
          className="h-11 px-4 justify-center active:opacity-60"
        >
          <Text className="text-primary text-[15px] font-semibold">Edit</Text>
        </Pressable>
      </View>

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />}>

        {/* What and when: the date tile, at its largest. */}
        <View className="flex-row items-start gap-4 px-5 pt-2">
          <View className="w-16 rounded-2xl bg-muted items-center py-2.5">
            <Text allowFontScaling={false} className="text-muted-foreground text-[11px] leading-[14px] font-bold tracking-wider">
              {day.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}
            </Text>
            <Text allowFontScaling={false} className="text-foreground text-[28px] leading-8 font-bold tracking-tight">
              {day.getDate()}
            </Text>
            <Text allowFontScaling={false} className="text-muted-foreground text-[11px] leading-[14px] font-semibold">
              {day.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}
            </Text>
          </View>
          <View className="flex-1 min-w-0 gap-1.5">
            <Text accessibilityRole="header" className="text-foreground text-[24px] leading-[30px] font-bold tracking-tight">
              {event.title}
            </Text>
            <View className="flex-row flex-wrap items-center gap-2">
              {/* The type's colour, once, as a dot. */}
              <View className="flex-row items-center gap-1.5">
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: eventColor(event.event_type) }} />
                <Text className="text-secondary-foreground text-[14px] leading-5">{eventTypeLabel(event)}</Text>
              </View>
              {!isOwner && (
                <View className="rounded-full bg-muted px-2.5 py-0.5">
                  <Text className="text-secondary-foreground text-[12px] font-semibold">Guest</Text>
                </View>
              )}
              {countdown && (
                <View className="rounded-full bg-action px-2.5 py-0.5">
                  <Text className="text-action-foreground text-[12px] leading-4 font-bold">Starts {countdown}</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* The facts, a row each. */}
        <View className={`mx-5 mt-7 ${CARD}`}>
          <View className="min-h-14 flex-row items-center gap-3 px-4 py-2">
            <ClockIcon size={18} className="text-secondary-foreground" />
            <View className="flex-1 min-w-0">
              <Text className="text-foreground text-[15px] leading-5 font-semibold">
                {event.event_time ? formatTime(event.event_time) : 'All day'}
              </Text>
              <Text className="text-muted-foreground text-[13px] leading-[18px]">{formatDateFull(event.event_date)}</Text>
            </View>
          </View>
          {location && (
            <Pressable
              onPress={openMap}
              accessibilityRole="link"
              accessibilityLabel={`${location}. Open in Maps`}
              className="min-h-14 flex-row items-center gap-3 px-4 py-2 border-t border-border/30 active:bg-muted/40"
            >
              <MapPinIcon size={18} className="text-secondary-foreground" />
              <Text className="flex-1 text-foreground text-[15px] leading-5 font-semibold">{location}</Text>
              <Text className={LINK}>Map</Text>
            </Pressable>
          )}
          {workspace && (
            <Pressable
              onPress={() => router.push(`/workspaces/${workspace.id}`)}
              accessibilityRole="button"
              accessibilityLabel={`Open ${workspace.name}`}
              className="min-h-14 flex-row items-center gap-3 pl-4 pr-3 py-2 border-t border-border/30 active:bg-muted/40"
            >
              <FolderIcon size={18} className="text-secondary-foreground" />
              <Text className="flex-1 text-foreground text-[15px] leading-5 font-semibold" numberOfLines={1}>
                {workspace.name}
              </Text>
              <ChevronRightIcon size={16} className="text-muted-foreground" />
            </Pressable>
          )}
        </View>

        {/* Notes, to be read: on the page, at reading size. */}
        {event.description ? (
          <View className="px-5 mt-7">
            <Text accessibilityRole="header" className={TITLE}>Notes</Text>
            <Text className="text-foreground text-[15px] leading-[22px] mt-2">{event.description}</Text>
          </View>
        ) : null}

        {/* Attendees — only the organiser can change who is invited. A guest
            sees who organised it and who else is going, which they were
            already allowed to read and were never shown. */}
        {isOwner ? (
          <EventAttendeesSection eventId={eventId} />
        ) : (
          <EventAttendeesSection
            eventId={eventId}
            readOnly
            organiser={
              event.organiser_name
                ? { name: event.organiser_name, avatarUrl: event.organiser_avatar_url ?? null }
                : null
            }
          />
        )}

        {/* Reminders */}
        <View className="px-5 mt-7">
          <View className="flex-row items-center justify-between mb-2.5">
            <Text accessibilityRole="header" className={TITLE}>Reminders</Text>
            <Pressable
              onPress={() => router.push(`/schedule/reminders/create?eventId=${eventId}`)}
              accessibilityRole="button"
              accessibilityLabel="Add a reminder"
              hitSlop={12}
              className="active:opacity-60"
            >
              <Text className={LINK}>Add</Text>
            </Pressable>
          </View>
          {reminders.length === 0 ? (
            // One row, not a block: most events have none.
            <View className={`${CARD} min-h-[60px] justify-center px-4`}>
              <Text className="text-muted-foreground text-[15px]">No reminders set</Text>
            </View>
          ) : (
            <View className={CARD}>
              {reminders.map((rem, i) => (
                <Pressable key={rem.id} onPress={() => router.push(`/schedule/reminders/${rem.id}`)}
                  accessibilityRole="button"
                  accessibilityLabel={rem.title}
                  className={`min-h-[60px] flex-row items-center gap-3 pl-4 pr-1 active:bg-muted/40 ${i > 0 ? 'border-t border-border/30' : ''}`}>
                  <View className="w-9 h-9 rounded-xl bg-muted items-center justify-center">
                    {rem.is_alarm_enabled ? <BellIcon size={18} className="text-secondary-foreground" /> : <BellOffIcon size={18} className="text-muted-foreground" />}
                  </View>
                  <View className="flex-1 min-w-0">
                    <Text className={`text-[15px] leading-5 font-semibold ${rem.is_completed ? 'text-muted-foreground line-through' : 'text-foreground'}`} numberOfLines={1}>{rem.title}</Text>
                    <Text className="text-muted-foreground text-[13px] leading-[18px]" numberOfLines={1}>
                      {new Date(rem.reminder_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      {' · '}
                      {new Date(rem.reminder_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      {rem.has_push_notification ? ' · Push' : ''}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: rem.is_completed }}
                    accessibilityLabel={`${rem.title}, done`}
                    onPress={(e) => {
                      e.stopPropagation();
                      toggleReminder(rem.id, !rem.is_completed);
                    }}
                    className="w-11 h-11 items-center justify-center active:scale-[0.9]"
                  >
                    {rem.is_completed ? <CheckCircleIcon size={20} className="text-success" /> : <CircleIcon size={20} className="text-muted-foreground" />}
                  </Pressable>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* Leaving or deleting, alone at the foot. Delete stays with whoever
            created it: it cannot be undone, and it takes the event off
            everybody's calendar. */}
        <View className="px-5 mt-7">
          {!isOwner && (
            <Text className="text-muted-foreground text-[13px] text-center leading-[18px]">
              This is not your event. The organiser and everyone going will be
              told what you change.
            </Text>
          )}
          {!isOwner && (
            <Pressable
              onPress={cantMakeIt}
              disabled={respond.isPending}
              accessibilityRole="button"
              className="min-h-11 items-center justify-center mt-2 active:opacity-60"
            >
              <Text className="text-destructive text-[15px] font-semibold">
                {respond.isPending ? 'Leaving…' : "Can't make it"}
              </Text>
            </Pressable>
          )}
          {isOwner && (
            <Pressable
              onPress={confirmDelete}
              accessibilityRole="button"
              className="min-h-11 items-center justify-center active:opacity-60"
            >
              <Text className="text-destructive text-[15px] font-semibold">Delete event</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
