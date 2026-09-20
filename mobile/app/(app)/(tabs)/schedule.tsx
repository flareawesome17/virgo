import { View, Text, ScrollView, RefreshControl, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth, useReminders, useScheduleEvents, useTheme, useUpdateReminder } from '@/src/hooks';
import { useState, useMemo } from 'react';
import { router } from 'expo-router';
import {
  CalendarDaysIcon,
  ClockIcon,
  TagIcon,
  ScissorsIcon,
  EyeIcon,
  PackageIcon,
  PresentationIcon,
  PlusIcon,
  ChevronRightIcon,
  BellIcon,
  BellOffIcon,
  CheckCircleIcon,
  CircleIcon,
  type LucideIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { AppTopBar, AttendeeSummary, EventInvitationsCard } from '@/components';
import {
  DAY_DOT_SIZE,
  DAYS,
  MONTHS,
  dayDots,
  eventColor,
  formatTime,
  getMonthWeeks,
  labelForDateKey,
  todayKey, isEventUpcoming, eventTypeLabel } from '@/src/lib/calendar';
import { PALETTES } from '@/theme';

cssInterop(CalendarDaysIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ClockIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(TagIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ScissorsIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(EyeIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(PackageIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(PresentationIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(PlusIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ChevronRightIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(BellIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(BellOffIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CheckCircleIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CircleIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

const EVENT_ICONS: Record<string, LucideIcon> = {
  event: CalendarDaysIcon, editing: ScissorsIcon, review: EyeIcon,
  delivery: PackageIcon, meeting: PresentationIcon, other: TagIcon,
};
// Date helpers and the event colour table live in src/lib/calendar.ts — both
// were duplicated across these screens. The date copies mishandled month/year
// rollover; the colour table had drifted into five copies.

export default function ScheduleScreen() {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const [refreshing, setRefreshing] = useState(false);

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState(todayKey);

  const { events, refetch: refetchEvents } = useScheduleEvents(
    { orderBy: 'event_date', direction: 'asc', limit: 100 },
    { enabled: !!user?.id },
  );

  const { reminders, refetch: refetchReminders } = useReminders(
    { orderBy: 'reminder_time', direction: 'asc', limit: 100 },
    { enabled: !!user?.id },
  );

  // The tick had no handler, so reminders could not be completed from here.
  const updateReminder = useUpdateReminder();
  const toggleReminder = (id: string, is_completed: boolean) =>
    updateReminder.mutate({ id, is_completed });

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchEvents(), refetchReminders()]);
    setRefreshing(false);
  };

  const eventsByDate = useMemo(() => {
    const m: Record<string, typeof events> = {};
    for (const ev of events) {
      if (!m[ev.event_date]) m[ev.event_date] = [];
      m[ev.event_date].push(ev);
    }
    return m;
  }, [events]);

  const monthWeeks = getMonthWeeks(viewYear, viewMonth);
  const selectedEvents = eventsByDate[selectedDate] || [];
  // Compared against the moment, not the date: a 9am event was still listed as
  // upcoming that same evening.
  const upcomingEvents = events
    .filter((e) => isEventUpcoming(e.event_date, e.event_time))
    .slice(0, 3);
  const activeReminders = reminders.filter(r => !r.is_completed);

  const goPrevMonth = () => {
    if (viewMonth === 0) { setViewYear(viewYear - 1); setViewMonth(11); }
    else setViewMonth(viewMonth - 1);
  };
  const goNextMonth = () => {
    if (viewMonth === 11) { setViewYear(viewYear + 1); setViewMonth(0); }
    else setViewMonth(viewMonth + 1);
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <AppTopBar />
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />}>
        
        {/* Header */}
        <View className="px-5 pt-4 pb-1 flex-row items-center justify-between">
          <View>
            <Text className="text-foreground text-[28px] font-bold tracking-tight">Schedule</Text>
            <Text className="text-muted-foreground text-sm mt-1">{events.length} events · {activeReminders.length} reminders</Text>
          </View>
          <Pressable
            onPress={() => router.push('/schedule/create')}
            accessibilityRole="button"
            accessibilityLabel="Create an event"
            className="w-11 h-11 rounded-xl bg-action items-center justify-center active:scale-[0.96]"
          >
            <PlusIcon size={20} className="text-action-foreground" />
          </Pressable>
        </View>

        {/* Month Calendar */}
        <View className="mx-5 mt-4 bg-secondary rounded-2xl p-4">
          {/* Month navigator */}
          <View className="flex-row items-center justify-between mb-4">
            <Pressable
              onPress={goPrevMonth}
              accessibilityRole="button"
              accessibilityLabel="Previous month"
              className="w-11 h-11 rounded-xl bg-card items-center justify-center active:scale-[0.96]"
            >
              <Text className="text-foreground text-sm font-bold">‹</Text>
            </Pressable>
            <Text className="text-foreground text-base font-bold tracking-tight">{MONTHS[viewMonth]} {viewYear}</Text>
            <View className="flex-row items-center gap-2">
              <Pressable onPress={() => router.push('/schedule/calendar')} className="active:opacity-60">
                <Text className="text-primary text-xs font-semibold">Full</Text>
              </Pressable>
              <Pressable
                onPress={goNextMonth}
                accessibilityRole="button"
                accessibilityLabel="Next month"
                className="w-11 h-11 rounded-xl bg-card items-center justify-center active:scale-[0.96]"
              >
                <Text className="text-foreground text-sm font-bold">›</Text>
              </Pressable>
            </View>
          </View>
          {/* Day labels — flex-1 so the columns line up exactly with the grid */}
          <View className="flex-row mb-1">
            {DAYS.map(d => (
              <View key={d} style={{ flex: 1 }} className="items-center py-1">
                <Text className="text-muted-foreground text-[11px] font-bold">{d.slice(0,2)}</Text>
              </View>
            ))}
          </View>
          {/* Day cells — one View per week. A single wrapping container with
              percentage widths dropped the 7th cell onto the next row. */}
          {monthWeeks.map((week, w) => (
            <View key={w} className="flex-row">
            {week.map((cell) => {
              const dayEvents = eventsByDate[cell.key] ?? [];
              const isSel = cell.key === selectedDate;
              return (
                <Pressable
                  key={cell.key}
                  // Outside days are selectable and page the view to their
                  // month — standard calendar behaviour. Previously they were
                  // inert, and the month-switch branch was unreachable.
                  onPress={() => {
                    setSelectedDate(cell.key);
                    if (cell.month !== viewMonth || cell.year !== viewYear) {
                      setViewMonth(cell.month);
                      setViewYear(cell.year);
                    }
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${labelForDateKey(cell.key)}, ${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'}`}
                  accessibilityState={{ selected: isSel }}
                  style={{ flex: 1 }}
                  className="items-center py-1.5"
                >
                  <View className={`w-8 h-8 rounded-full items-center justify-center ${cell.isToday ? 'bg-action' : isSel ? 'bg-primary/15' : ''}`}>
                    <Text className={`text-xs font-bold ${cell.isOutside ? 'text-muted-foreground/40' : cell.isToday ? 'text-action-foreground' : isSel ? 'text-primary' : 'text-foreground'}`}>
                      {cell.day}
                    </Text>
                  </View>
                  {dayEvents.length > 0 && (() => {
                    const dots = dayDots(dayEvents);
                    return (
                      <View className="flex-row items-center gap-[3px] mt-0.5" style={{ opacity: cell.isOutside ? 0.35 : 1 }}>
                        {dots.colors.map((color, i) => (
                          <View
                            key={i}
                            style={{
                              width: DAY_DOT_SIZE,
                              height: DAY_DOT_SIZE,
                              borderRadius: DAY_DOT_SIZE / 2,
                              backgroundColor: color,
                            }}
                          />
                        ))}
                        {dots.overflow > 0 && (
                          <Text className="text-muted-foreground text-[11px] font-bold">+{dots.overflow}</Text>
                        )}
                      </View>
                    );
                  })()}
                </Pressable>
              );
            })}
            </View>
          ))}
        </View>

        {/* Invitations — renders nothing when there are none, so the usual
            day is unchanged. Above the agenda because it needs a decision. */}
        <EventInvitationsCard />

        {/* Selected Day Agenda */}
        <View className="px-5 mt-5">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-foreground text-lg font-bold tracking-tight">{labelForDateKey(selectedDate)}</Text>
            <Pressable onPress={() => router.push(`/schedule/agenda?date=${selectedDate}`)} className="flex-row items-center gap-1 active:opacity-60">
              <Text className="text-primary text-sm font-semibold">Agenda</Text>
              <ChevronRightIcon size={14} className="text-primary" />
            </Pressable>
          </View>
          {selectedEvents.length === 0 ? (
            <View className="bg-card rounded-2xl p-6 items-center gap-3">
              <View className="w-12 h-12 rounded-full bg-muted items-center justify-center"><CalendarDaysIcon size={22} className="text-muted-foreground" /></View>
              <Text className="text-muted-foreground text-sm font-medium">No events on this day</Text>
              <Pressable
                onPress={() => router.push(`/schedule/create?date=${selectedDate}`)}
                accessibilityRole="button"
                className="min-h-11 bg-action rounded-xl px-5 py-2.5 flex-row items-center gap-2 active:scale-[0.98]"
              >
                <PlusIcon size={15} className="text-action-foreground" />
                <Text className="text-action-foreground text-sm font-semibold">Add Event</Text>
              </Pressable>
            </View>
          ) : (
            <View className="bg-card rounded-2xl overflow-hidden border border-border/30">
              {selectedEvents.map((ev, i) => {
                const IconComp = EVENT_ICONS[ev.event_type] || CalendarDaysIcon;
                const color = eventColor(ev.event_type);
                const evReminders = reminders.filter(r => r.schedule_event_id === ev.id);
                return (
                  <Pressable key={ev.id} onPress={() => router.push(`/schedule/${ev.id}`)}
                    className="px-4 py-3.5 flex-row items-center gap-3 active:bg-muted/30"
                    style={i < selectedEvents.length - 1 ? { borderBottomWidth: 1, borderBottomColor: palette.border } : undefined}>
                    <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: `${color}18`, alignItems: 'center', justifyContent: 'center' }}>
                      <IconComp size={16} color={color} />
                    </View>
                    <View className="flex-1 min-w-0">
                      <Text className="text-foreground text-sm font-bold" numberOfLines={1}>{ev.title}</Text>
                      <Text className="text-muted-foreground text-xs mt-0.5">
                        {eventTypeLabel(ev)}
                        {ev.is_owner === false ? ' · Guest' : ''}
                      </Text>
                      {/* Renders nothing unless somebody was invited. */}
                      {ev.is_owner !== false && <AttendeeSummary eventId={ev.id} />}
                    </View>
                    <View className="items-end gap-1">
                      {ev.event_time && <Text className="text-foreground text-sm font-bold">{formatTime(ev.event_time)}</Text>}
                      {evReminders.length > 0 && <BellIcon size={11} className="text-primary" />}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {/* Upcoming */}
        <View className="px-5 mt-6">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-foreground text-lg font-bold tracking-tight">Upcoming</Text>
            <Pressable onPress={() => router.push('/schedule/calendar')} className="flex-row items-center gap-1 active:opacity-60">
              <Text className="text-primary text-sm font-semibold">Calendar</Text>
              <ChevronRightIcon size={14} className="text-primary" />
            </Pressable>
          </View>
          {upcomingEvents.length === 0 ? (
            <View className="bg-card rounded-2xl p-6 items-center gap-2">
              <CalendarDaysIcon size={20} className="text-muted-foreground" />
              <Text className="text-muted-foreground text-sm">No upcoming events</Text>
            </View>
          ) : (
            <View className="gap-2">
              {upcomingEvents.map(ev => {
                const color = eventColor(ev.event_type);
                return (
                  <Pressable key={ev.id} onPress={() => router.push(`/schedule/${ev.id}`)}
                    className="bg-card rounded-2xl px-4 py-3 flex-row items-center gap-3 border border-border/30 active:scale-[0.98]">
                    <View style={{ width: 3, height: 32, borderRadius: 2, backgroundColor: color }} />
                    <View className="flex-1 min-w-0">
                      <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>{ev.title}</Text>
                      <Text className="text-muted-foreground text-xs mt-0.5">{labelForDateKey(ev.event_date)}{ev.event_time ? ` · ${formatTime(ev.event_time)}` : ''}</Text>
                    </View>
                    <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, backgroundColor: `${color}14` }}>
                      <Text numberOfLines={1} style={{ color, fontSize: 11, fontWeight: '700' }}>{eventTypeLabel(ev)}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {/* Reminders */}
        <View className="px-5 mt-6">
          <Text className="text-foreground text-lg font-bold tracking-tight mb-3">Reminders</Text>
          {activeReminders.length === 0 ? (
            <View className="bg-card rounded-2xl p-6 items-center gap-2">
              <BellIcon size={20} className="text-muted-foreground" />
              <Text className="text-muted-foreground text-sm">No active reminders</Text>
            </View>
          ) : (
            <View className="bg-card rounded-2xl overflow-hidden border border-border/30">
              {activeReminders.slice(0, 4).map((rem, i) => (
                <Pressable key={rem.id} onPress={() => router.push(`/schedule/reminders/${rem.id}`)}
                  className="flex-row items-center gap-3 px-4 py-3 active:bg-muted/30"
                  style={i < Math.min(activeReminders.length, 4) - 1 ? { borderBottomWidth: 1, borderBottomColor: palette.border } : undefined}>
                  <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: rem.is_alarm_enabled ? `${palette.primary}18` : '#A8948920', alignItems: 'center', justifyContent: 'center' }}>
                    {rem.is_alarm_enabled ? <BellIcon size={14} className="text-primary" /> : <BellOffIcon size={14} className="text-muted-foreground" />}
                  </View>
                  <View className="flex-1 min-w-0">
                    <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>{rem.title}</Text>
                    <View className="flex-row items-center gap-2 mt-0.5">
                      <Text className="text-muted-foreground text-xs">{new Date(rem.reminder_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Text>
                      {rem.has_push_notification && (
                        <View style={{ paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3, backgroundColor: '#5B7B9A18' }}>
                          <Text style={{ color: '#5B7B9A', fontSize: 11, fontWeight: '700' }}>Push</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <Pressable
                    onPress={(event) => {
                      event.stopPropagation();
                      toggleReminder(rem.id, !rem.is_completed);
                    }}
                    accessibilityRole="checkbox"
                    accessibilityLabel={`Mark ${rem.title} ${rem.is_completed ? 'incomplete' : 'complete'}`}
                    accessibilityState={{ checked: rem.is_completed }}
                    className="w-11 h-11 items-center justify-center active:scale-[0.96]"
                  >
                    {rem.is_completed ? <CheckCircleIcon size={18} className="text-[#6B8E4E]" /> : <CircleIcon size={18} className="text-muted-foreground" />}
                  </Pressable>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
