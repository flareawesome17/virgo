import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth, useScheduleEvents, useTheme } from '@/src/hooks';
import { useState, useMemo } from 'react';
import { router } from 'expo-router';
import {
  ArrowLeftIcon, PlusIcon, CalendarDaysIcon,
  TagIcon, ScissorsIcon, EyeIcon, PackageIcon, PresentationIcon,
  type LucideIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import {
  DAY_DOT_SIZE,
  DAYS,
  dayDots,
  eventColor,
  formatTime,
  getMonthWeeks,
  todayKey,
  eventTypeLabel,
} from '@/src/lib/calendar';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(PlusIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CalendarDaysIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(TagIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ScissorsIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(EyeIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(PackageIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(PresentationIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

const EVENT_ICONS: Record<string, LucideIcon> = {
  event: CalendarDaysIcon, editing: ScissorsIcon, review: EyeIcon,
  delivery: PackageIcon, meeting: PresentationIcon, other: TagIcon,
};
// Long month names for this screen's header; the rest of the date helpers
// come from src/lib/calendar.ts. The local copies mishandled month/year
// rollover, emitting keys like 2026-00-29 and 2026-13-01.
const MONTHS_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export default function CalendarScreen() {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState(todayKey());

  const { events } = useScheduleEvents(
    { orderBy: 'event_date', direction: 'asc', limit: 100 },
    { enabled: !!user?.id },
  );

  const eventsByDate = useMemo(() => {
    const m: Record<string, typeof events> = {};
    for (const ev of events) { if (!m[ev.event_date]) m[ev.event_date] = []; m[ev.event_date].push(ev); }
    return m;
  }, [events]);

  const monthWeeks = getMonthWeeks(viewYear, viewMonth);
  const selectedEvents = eventsByDate[selectedDate] || [];
  const isSelToday = selectedDate === todayKey();

  const goPrev = () => { if (viewMonth === 0) { setViewYear(viewYear-1); setViewMonth(11); } else setViewMonth(viewMonth-1); };
  const goNext = () => { if (viewMonth === 11) { setViewYear(viewYear+1); setViewMonth(0); } else setViewMonth(viewMonth+1); };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Header */}
        <View className="px-5 pt-4 pb-1 flex-row items-center gap-3">
          <Pressable onPress={() => router.back()} className="w-10 h-10 rounded-2xl bg-card items-center justify-center active:scale-[0.94]"
            style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
            <ArrowLeftIcon size={18} className="text-foreground" />
          </Pressable>
          <View className="flex-1">
            <Text className="text-foreground text-[22px] font-bold tracking-tight">Calendar</Text>
            <Text className="text-muted-foreground text-sm mt-0.5">{events.length} events scheduled</Text>
          </View>
          <Pressable onPress={() => router.push('/schedule/create')} className="w-11 h-11 rounded-2xl bg-action items-center justify-center active:scale-[0.94]"
            style={{ shadowColor: '#B66A40', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4 }}>
            <PlusIcon size={20} className="text-white" />
          </Pressable>
        </View>

        {/* Full Calendar */}
        <View className="mx-5 mt-4 bg-card rounded-2xl p-5" style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 }}>
          <View className="flex-row items-center justify-between mb-5">
            <Pressable onPress={goPrev} className="w-10 h-10 rounded-full bg-muted items-center justify-center active:scale-[0.92]">
              <Text className="text-foreground text-lg font-bold">‹</Text>
            </Pressable>
            <Text className="text-foreground text-lg font-extrabold tracking-tight">{MONTHS_LONG[viewMonth]} {viewYear}</Text>
            <Pressable onPress={goNext} className="w-10 h-10 rounded-full bg-muted items-center justify-center active:scale-[0.92]">
              <Text className="text-foreground text-lg font-bold">›</Text>
            </Pressable>
          </View>
          {/* Day labels */}
          <View className="flex-row mb-2">
            {DAYS.map(d => (
              <View key={d} style={{ flex: 1 }} className="items-center py-1">
                <Text className="text-muted-foreground text-[10px] font-bold uppercase tracking-[1.5px]">{d.slice(0,2)}</Text>
              </View>
            ))}
          </View>
          {/* Grid — one View per week with flex-1 cells. A single wrapping
              container of `width: 100/7 %` rounded past 100%, so the seventh
              cell wrapped and the Sunday column rendered empty. */}
          {monthWeeks.map((week, w) => (
            <View key={w} className="flex-row">
            {week.map((cell) => {
              const key = cell.key;
              const dayEvents = eventsByDate[key] || [];
              const has = dayEvents.length > 0;
              const isSel = key === selectedDate;
              return (
                <Pressable key={key} onPress={() => setSelectedDate(key)}
                  style={{ flex: 1 }} className="items-center pt-1 pb-2">
                  <View className={`w-9 h-9 rounded-xl items-center justify-center mb-1 ${
                    cell.isToday ? 'bg-action' : isSel ? 'bg-primary/10' : ''}`}>
                    <Text className={`text-sm font-bold ${cell.isOutside ? 'text-muted-foreground/20' : cell.isToday ? 'text-white' : isSel ? 'text-primary' : 'text-foreground'}`}>
                      {cell.day}
                    </Text>
                  </View>
                  {has && (() => {
                    const dots = dayDots(dayEvents);
                    return (
                      <View className="flex-row items-center gap-[3px]" style={{ opacity: cell.isOutside ? 0.35 : 1 }}>
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
                          <Text className="text-muted-foreground text-[8px] font-bold">+{dots.overflow}</Text>
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

        {/* Selected day detail */}
        <View className="px-5 mt-6">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-foreground text-lg font-bold tracking-tight">
              {isSelToday ? 'Today' : new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </Text>
            <Pressable onPress={() => router.push(`/schedule/agenda?date=${selectedDate}`)} className="flex-row items-center gap-1 active:opacity-60">
              <Text className="text-primary text-sm font-semibold">Day View</Text>
              <CalendarDaysIcon size={14} className="text-primary" />
            </Pressable>
          </View>
          {selectedEvents.length === 0 ? (
            <View className="bg-card rounded-2xl p-8 items-center gap-4">
              <View className="w-14 h-14 rounded-full bg-muted items-center justify-center">
                <CalendarDaysIcon size={24} className="text-muted-foreground" />
              </View>
              <View className="items-center gap-1">
                <Text className="text-foreground text-base font-bold">No events</Text>
                <Text className="text-muted-foreground text-sm text-center">This day is clear — tap + to schedule something</Text>
              </View>
              <Pressable onPress={() => router.push(`/schedule/create?date=${selectedDate}`)} className="bg-action rounded-xl px-5 py-3 flex-row items-center gap-2 active:scale-[0.96]">
                <PlusIcon size={16} className="text-white" />
                <Text className="text-white text-sm font-semibold">Add Event</Text>
              </Pressable>
            </View>
          ) : (
            <View className="gap-2">
              {selectedEvents.map(ev => {
                const IconComp = EVENT_ICONS[ev.event_type] || CalendarDaysIcon;
                const color = eventColor(ev.event_type);
                return (
                  <Pressable key={ev.id} onPress={() => router.push(`/schedule/${ev.id}`)}
                    className="bg-card rounded-2xl p-4 flex-row items-center gap-4 active:scale-[0.98]"
                    style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
                    <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: `${color}18`, alignItems: 'center', justifyContent: 'center' }}>
                      <IconComp size={18} color={color} />
                    </View>
                    <View className="flex-1 min-w-0">
                      <Text className="text-foreground text-sm font-bold" numberOfLines={1}>{ev.title}</Text>
                      {ev.description ? <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>{ev.description}</Text> : null}
                      <View className="flex-row items-center gap-3 mt-2">
                        <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, backgroundColor: `${color}14` }}>
                          <Text numberOfLines={1} style={{ color, fontSize: 9, fontWeight: '700', textTransform: ev.event_type_other ? 'none' : 'uppercase', letterSpacing: 0.3 }}>{eventTypeLabel(ev)}</Text>
                        </View>
                      </View>
                    </View>
                    {ev.event_time && (
                      <View className="bg-muted rounded-lg px-2.5 py-1.5">
                        <Text className="text-foreground text-sm font-bold">{formatTime(ev.event_time)}</Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
