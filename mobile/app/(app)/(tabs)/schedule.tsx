import { View, Text, RefreshControl, Pressable, Alert } from 'react-native';
import Animated from 'react-native-reanimated';
import { useAuth, useReminders, useScheduleEventRange, useTheme, useUpdateReminder } from '@/src/hooks';
import { useChromeScroll } from '@/src/providers/ChromeProvider';
import { useState, useMemo } from 'react';
import { router } from 'expo-router';
import {
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  BellIcon,
  BellOffIcon,
  CheckCircleIcon,
  CircleIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { AttendeeSummary, EventInvitationsCard, TabScreen, useTabBottomInset } from '@/components';
import { DateTile, timeParts } from '@/components/DateTile';
import { LoadFailed } from '@/components/LoadFailed';
import {
  DAY_DOT_SIZE,
  DAYS,
  MONTHS,
  dayDots,
  eventColor,
  formatTime,
  getMonthWeeks,
  labelForDateKey,
  parseDateKey,
  todayKey, isEventUpcoming, eventTypeLabel, dateToKey } from '@/src/lib/calendar';
import { PALETTES } from '@/theme';

for (const Icon of [
  CalendarDaysIcon, ChevronLeftIcon, ChevronRightIcon, BellIcon, BellOffIcon, CheckCircleIcon, CircleIcon,
]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/** The one card on this screen, the same one the Dashboard uses. */
const CARD = 'bg-card rounded-[20px] border border-border/40 overflow-hidden';
const TITLE = 'text-foreground text-[17px] leading-6 font-bold tracking-tight';
const LINK = 'text-primary text-[14px] font-semibold';
// Date helpers and the event colour table live in src/lib/calendar.ts — both
// were duplicated across these screens. The date copies mishandled month/year
// rollover; the colour table had drifted into five copies.

export default function ScheduleScreen() {
  const onScroll = useChromeScroll();
  const bottomInset = useTabBottomInset();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const [refreshing, setRefreshing] = useState(false);

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState(todayKey);

  /*
   * The month on screen, and the weeks ahead — not the account's 100 oldest.
   *
   * Both came from one list of the 100 earliest events, so an account with a
   * past behind it saw no events this month or later at all, and Upcoming
   * sat empty. The grid asks for exactly the days it draws; Upcoming for the
   * next 60 days.
   */
  const monthWeeks = getMonthWeeks(viewYear, viewMonth);
  const { events, refetch: refetchEvents, loadFailed: monthFailed } = useScheduleEventRange(
    monthWeeks[0]?.[0]?.key,
    monthWeeks[monthWeeks.length - 1]?.[6]?.key,
  );
  const [soonWindow] = useState(() => {
    const end = new Date();
    end.setDate(end.getDate() + 60);
    return { from: todayKey(), to: dateToKey(end) };
  });
  const { events: soonEvents, refetch: refetchSoon, loadFailed: soonFailed } = useScheduleEventRange(
    soonWindow.from,
    soonWindow.to,
  );

  // Not done, oldest first: the overdue as well as what is coming. Counted
  // from today only, one whose time had passed unticked dropped off Schedule
  // for good. The same query as Reminders › See all, so it is one fetch.
  const { reminders, refetch: refetchReminders, loadFailed: remindersFailed } = useReminders(
    { is_completed: false, orderBy: 'reminder_time', direction: 'asc', limit: 100 },
    { enabled: !!user?.id },
  );

  // The tick had no handler, so reminders could not be completed from here.
  const updateReminder = useUpdateReminder();
  const toggleReminder = (id: string, is_completed: boolean) =>
    updateReminder.mutate(
      { id, is_completed },
      {
        onError: (error) =>
          Alert.alert("Couldn't update it", error instanceof Error ? error.message : 'Please try again.'),
      },
    );

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchEvents(), refetchSoon(), refetchReminders()]);
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

  const selectedEvents = eventsByDate[selectedDate] || [];
  // Compared against the moment, not the date: a 9am event was still listed as
  // upcoming that same evening.
  const upcomingEvents = soonEvents
    .filter((e) => isEventUpcoming(e.event_date, e.event_time) && e.event_date !== selectedDate)
    .slice(0, 3);
  const [now] = useState(() => Date.now());
  const overdueReminders = reminders.filter((r) => !r.is_completed && Date.parse(r.reminder_time) < now);
  const activeReminders = reminders.filter((r) => !r.is_completed && Date.parse(r.reminder_time) >= now);

  const goPrevMonth = () => {
    if (viewMonth === 0) { setViewYear(viewYear - 1); setViewMonth(11); }
    else setViewMonth(viewMonth - 1);
  };
  // Offered once you have moved off today — another month, or another day.
  const awayFromToday =
    viewMonth !== today.getMonth() || viewYear !== today.getFullYear() || selectedDate !== todayKey();
  const goToday = () => {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    setSelectedDate(todayKey());
  };
  const goNextMonth = () => {
    if (viewMonth === 11) { setViewYear(viewYear + 1); setViewMonth(0); }
    else setViewMonth(viewMonth + 1);
  };

  return (
    <TabScreen title="Schedule" create="event">
      <Animated.ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: bottomInset }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />}>

        {/* A failed load drew "No upcoming events" and "No active reminders" —
            a confident empty day, from requests that never arrived. */}
        {(monthFailed || soonFailed || remindersFailed) &&
          events.length === 0 && soonEvents.length === 0 && reminders.length === 0 && (
          <View className={`mx-5 mt-3 ${CARD}`}>
            <LoadFailed what="your schedule" onRetry={() => void onRefresh()} compact />
          </View>
        )}

        {/* The month, on the page itself. It sat in a tinted panel with white
            discs for arrows, which made the calendar the heaviest thing on a
            screen whose point is the day under it. */}
        <View className="px-5 pt-2">
          {/* The month, a way home when you have wandered off it, and the
              arrows together on the right where the thumb is. */}
          <View className="flex-row items-center">
            <Text accessibilityRole="header" className={`flex-1 ${TITLE}`}>
              {MONTHS[viewMonth]} {viewYear}
            </Text>
            {awayFromToday && (
              <Pressable
                onPress={goToday}
                accessibilityRole="button"
                accessibilityLabel="Go to today"
                hitSlop={6}
                className="h-8 px-3 rounded-full bg-muted items-center justify-center active:opacity-70"
              >
                <Text className="text-secondary-foreground text-[13px] font-semibold">Today</Text>
              </Pressable>
            )}
            <Pressable
              onPress={goPrevMonth}
              accessibilityRole="button"
              accessibilityLabel="Previous month"
              className="w-11 h-11 items-center justify-center active:opacity-60"
            >
              <ChevronLeftIcon size={20} className="text-foreground" />
            </Pressable>
            <Pressable
              onPress={goNextMonth}
              accessibilityRole="button"
              accessibilityLabel="Next month"
              className="w-11 h-11 -mr-3 items-center justify-center active:opacity-60"
            >
              <ChevronRightIcon size={20} className="text-foreground" />
            </Pressable>
          </View>
          {/* Day labels — flex-1 so the columns line up exactly with the grid */}
          <View className="flex-row mt-1 mb-1">
            {DAYS.map((d, i) => (
              <View key={`${d}-${i}`} style={{ flex: 1 }} className="items-center py-1">
                <Text className="text-muted-foreground text-[12px] font-semibold">{d.slice(0, 1)}</Text>
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
              const dots = dayEvents.length > 0 ? dayDots(dayEvents) : null;
              return (
                <Pressable
                  key={cell.key}
                  // Outside days are selectable and page the view to their
                  // month — standard calendar behaviour.
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
                  className="items-center min-h-[46px] pt-0.5"
                >
                  {/* Today is the one filled day. A day you picked gets a
                      ring, so the two can never be mistaken for each other. */}
                  <View
                    className={`w-9 h-9 rounded-full items-center justify-center ${
                      cell.isToday ? 'bg-action' : isSel ? 'border-2 border-foreground' : ''
                    }`}
                  >
                    <Text
                      allowFontScaling={false}
                      className={`text-[15px] ${
                        cell.isToday
                          ? 'text-action-foreground font-bold'
                          : cell.isOutside
                            ? 'text-muted-foreground/60 font-medium'
                            : isSel
                              ? 'text-foreground font-bold'
                              : 'text-foreground font-medium'
                      }`}
                      style={{ fontVariant: ['tabular-nums'] }}
                    >
                      {cell.day}
                    </Text>
                  </View>
                  {dots && (
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
                  )}
                </Pressable>
              );
            })}
            </View>
          ))}
        </View>

        {/* Invitations — renders nothing when there are none, so the usual
            day is unchanged. Above the agenda because it needs a decision. */}
        <EventInvitationsCard />

        {/* The chosen day. Its rows lead with the hour, because the day is
            already in the title. */}
        <View className="px-5 mt-7">
          <View className="flex-row items-center justify-between mb-2.5">
            <Text accessibilityRole="header" className={TITLE}>{labelForDateKey(selectedDate)}</Text>
            <Pressable onPress={() => router.push(`/schedule/agenda?date=${selectedDate}`)} accessibilityRole="button" hitSlop={12} className="active:opacity-60">
              <Text className={LINK}>Agenda</Text>
            </Pressable>
          </View>
          {selectedEvents.length === 0 ? (
            // One row, not a block: an empty day is the usual day.
            <Pressable
              onPress={() => router.push(`/schedule/create?date=${selectedDate}`)}
              accessibilityRole="button"
              accessibilityLabel="Nothing on this day. Add an event"
              className={`${CARD} min-h-[60px] flex-row items-center gap-3 px-4 active:bg-muted/40`}
            >
              <View className="w-9 h-9 rounded-xl bg-muted items-center justify-center">
                <CalendarDaysIcon size={18} className="text-secondary-foreground" />
              </View>
              <Text className="flex-1 text-muted-foreground text-[15px]">Nothing on this day</Text>
              <Text className={LINK}>Add event</Text>
            </Pressable>
          ) : (
            <View className={CARD}>
              {selectedEvents.map((ev, i) => {
                const evReminders = reminders.filter(r => r.schedule_event_id === ev.id);
                const time = ev.event_time ? timeParts(ev.event_time) : null;
                return (
                  <Pressable key={ev.id} onPress={() => router.push(`/schedule/${ev.id}`)}
                    accessibilityRole="button"
                    accessibilityLabel={`${ev.title}${ev.event_time ? `, ${formatTime(ev.event_time)}` : ''}`}
                    className={`min-h-16 flex-row items-center gap-3 pl-2.5 pr-4 py-2.5 active:bg-muted/40 ${i > 0 ? 'border-t border-border/30' : ''}`}>
                    <DateTile small={time ? time.half : 'DAY'} large={time ? time.clock : 'All'} largeFirst wide />
                    <View className="flex-1 min-w-0">
                      <Text className="text-foreground text-[15px] leading-5 font-semibold" numberOfLines={1}>{ev.title}</Text>
                      <View className="flex-row items-center gap-1.5 mt-0.5">
                        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: eventColor(ev.event_type) }} />
                        <Text className="flex-1 text-muted-foreground text-[13px] leading-[18px]" numberOfLines={1}>
                          {eventTypeLabel(ev)}
                          {ev.location?.trim() ? ` · ${ev.location.trim()}` : ''}
                          {ev.is_owner === false ? ' · Guest' : ''}
                        </Text>
                      </View>
                      {/* Renders nothing unless somebody was invited. */}
                      {ev.is_owner !== false && <AttendeeSummary eventId={ev.id} />}
                    </View>
                    {evReminders.length > 0 && <BellIcon size={15} className="text-secondary-foreground" />}
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {/* What follows, in the Dashboard's rows, led by the date. The chosen
            day is left out: it is the list above, and it showed in both. */}
        <View className="px-5 mt-7">
          <View className="flex-row items-center justify-between mb-2.5">
            <Text accessibilityRole="header" className={TITLE}>Coming up</Text>
            <Pressable onPress={() => router.push('/schedule/calendar')} accessibilityRole="button" hitSlop={12} className="active:opacity-60">
              <Text className={LINK}>Calendar</Text>
            </Pressable>
          </View>
          {upcomingEvents.length === 0 ? (
            <View className={`${CARD} min-h-[60px] justify-center px-4`}>
              <Text className="text-muted-foreground text-[15px]">Nothing else in the next 60 days</Text>
            </View>
          ) : (
            <View className={CARD}>
              {upcomingEvents.map((ev, i) => {
                const d = parseDateKey(ev.event_date.slice(0, 10));
                return (
                  <Pressable key={ev.id} onPress={() => router.push(`/schedule/${ev.id}`)}
                    accessibilityRole="button"
                    accessibilityLabel={`${ev.title}, ${labelForDateKey(ev.event_date)}`}
                    className={`min-h-16 flex-row items-center gap-3 pl-2.5 pr-4 py-2.5 active:bg-muted/40 ${i > 0 ? 'border-t border-border/30' : ''}`}>
                    <DateTile
                      small={d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}
                      large={d.getDate()}
                      wide
                    />
                    <View className="flex-1 min-w-0">
                      <Text className="text-foreground text-[15px] leading-5 font-semibold" numberOfLines={1}>{ev.title}</Text>
                      <View className="flex-row items-center gap-1.5 mt-0.5">
                        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: eventColor(ev.event_type) }} />
                        <Text className="flex-1 text-muted-foreground text-[13px] leading-[18px]" numberOfLines={1}>
                          {eventTypeLabel(ev)}
                          {ev.location?.trim() ? ` · ${ev.location.trim()}` : ''}
                        </Text>
                      </View>
                    </View>
                    {ev.event_time ? (
                      <Text className="text-secondary-foreground text-[13px] font-semibold">{formatTime(ev.event_time)}</Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {/* Reminders. Their own, not only from inside an event: a reminder
            to back up a card or send an invoice belongs to no event. */}
        <View className="px-5 mt-7">
          <View className="flex-row items-center justify-between mb-2.5">
            <Text accessibilityRole="header" className={TITLE}>Reminders</Text>
            <View className="flex-row items-center gap-5">
              {/* Only four show here; the rest were unreachable. */}
              {(activeReminders.length > 4 || overdueReminders.length > 0) && (
                <Pressable
                  onPress={() => router.push('/schedule/reminders')}
                  accessibilityRole="button"
                  hitSlop={10}
                  className="active:opacity-60"
                >
                  <Text className={LINK}>See all</Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => router.push('/schedule/reminders/create')}
                accessibilityRole="button"
                accessibilityLabel="New reminder"
                hitSlop={10}
                className="active:opacity-60"
              >
                <Text className={LINK}>New</Text>
              </Pressable>
            </View>
          </View>
          {overdueReminders.length > 0 && (
            <Pressable
              onPress={() => router.push('/schedule/reminders')}
              accessibilityRole="button"
              className="flex-row items-center gap-2.5 rounded-[14px] bg-destructive/10 px-4 min-h-[44px] mb-2.5 active:opacity-70"
            >
              <BellIcon size={16} className="text-destructive" />
              <Text className="text-destructive text-[14px] font-semibold flex-1">
                {overdueReminders.length} overdue — tick {overdueReminders.length === 1 ? 'it' : 'them'} off or move {overdueReminders.length === 1 ? 'it' : 'them'}
              </Text>
            </Pressable>
          )}
          {activeReminders.length === 0 ? (
            <View className={`${CARD} min-h-[60px] justify-center px-4`}>
              <Text className="text-muted-foreground text-[15px]">No reminders set</Text>
            </View>
          ) : (
            <View className={CARD}>
              {activeReminders.slice(0, 4).map((rem, i) => (
                <Pressable key={rem.id} onPress={() => router.push(`/schedule/reminders/${rem.id}`)}
                  accessibilityRole="button"
                  accessibilityLabel={rem.title}
                  className={`min-h-[60px] flex-row items-center gap-3 pl-4 pr-1 active:bg-muted/40 ${i > 0 ? 'border-t border-border/30' : ''}`}>
                  <View className="w-9 h-9 rounded-xl bg-muted items-center justify-center">
                    {rem.is_alarm_enabled ? <BellIcon size={18} className="text-secondary-foreground" /> : <BellOffIcon size={18} className="text-muted-foreground" />}
                  </View>
                  <View className="flex-1 min-w-0">
                    <Text className="text-foreground text-[15px] leading-5 font-semibold" numberOfLines={1}>{rem.title}</Text>
                    <Text className="text-muted-foreground text-[13px] leading-[18px]" numberOfLines={1}>
                      {new Date(rem.reminder_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      {' · '}
                      {new Date(rem.reminder_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      {rem.has_push_notification ? ' · Push' : ''}
                    </Text>
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
                    {rem.is_completed ? <CheckCircleIcon size={20} className="text-success" /> : <CircleIcon size={20} className="text-muted-foreground" />}
                  </Pressable>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </Animated.ScrollView>
    </TabScreen>
  );
}
