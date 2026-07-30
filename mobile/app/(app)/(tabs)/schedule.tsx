import { View, Text, ScrollView, RefreshControl, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApp, useAuth, useTheme } from '@/src/hooks';
import { useState, useMemo } from 'react';
import { router } from 'expo-router';
import {
  CalendarDaysIcon,
  ClockIcon,
  CameraIcon,
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
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';

cssInterop(CalendarDaysIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ClockIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CameraIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
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

const EVENT_ICONS: Record<string, React.ComponentType<any>> = {
  shoot: CameraIcon, editing: ScissorsIcon, review: EyeIcon,
  delivery: PackageIcon, meeting: PresentationIcon,
};
const EVENT_COLORS: Record<string, string> = {
  shoot: '#B66A40', editing: '#C17745', review: '#8B5E3C',
  delivery: '#6B8E4E', meeting: '#5B7B9A',
};

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

function getMonthGrid(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const adjustedFirst = firstDay === 0 ? 6 : firstDay - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const cells: { day: number; month: number; year: number; isToday: boolean; isOutside: boolean }[] = [];
  const prevDays = new Date(year, month, 0).getDate();
  for (let i = adjustedFirst - 1; i >= 0; i--) {
    cells.push({ day: prevDays - i, month: month - 1, year, isToday: false, isOutside: true });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({
      day: d, month, year,
      isToday: today.getFullYear() === year && today.getMonth() === month && today.getDate() === d,
      isOutside: false,
    });
  }
  const remaining = 7 - (cells.length % 7 === 0 ? 7 : cells.length % 7);
  for (let d = 1; d <= remaining; d++) {
    cells.push({ day: d, month: month + 1, year, isToday: false, isOutside: true });
  }
  return cells;
}

function dateKey(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

function formatTime(timeStr: string | null): string {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':');
  const hour = parseInt(h);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

function isTodayDate(dateStr: string): boolean {
  const d = new Date(dateStr);
  const t = new Date();
  return d.toDateString() === t.toDateString();
}
function isTomorrowDate(dateStr: string): boolean {
  const d = new Date(dateStr);
  const t = new Date();
  t.setDate(t.getDate() + 1);
  return d.toDateString() === t.toDateString();
}
function labelForDate(dateStr: string): string {
  if (isTodayDate(dateStr)) return 'Today';
  if (isTomorrowDate(dateStr)) return 'Tomorrow';
  return new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function ScheduleScreen() {
  const { client } = useApp();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState(dateKey(today.getFullYear(), today.getMonth(), today.getDate()));

  const { data: events = [] } = useQuery({
    queryKey: ['schedule_events', user?.id],
    queryFn: async () => {
      const { data, error } = await client.from('schedule_events')
        .select('*').eq('user_id', user?.id)
        .order('event_date', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  const { data: reminders = [] } = useQuery({
    queryKey: ['reminders', user?.id],
    queryFn: async () => {
      const { data, error } = await client.from('reminders')
        .select('*').eq('user_id', user?.id)
        .order('reminder_time', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['schedule_events'] });
    await queryClient.invalidateQueries({ queryKey: ['reminders'] });
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

  const monthGrid = getMonthGrid(viewYear, viewMonth);
  const selectedEvents = eventsByDate[selectedDate] || [];
  const upcomingEvents = events.filter(e => e.event_date >= dateKey(today.getFullYear(), today.getMonth(), today.getDate())).slice(0, 3);
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
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={isDark ? '#C17745' : '#B66A40'} />}>
        
        {/* Header */}
        <View className="px-5 pt-4 pb-1 flex-row items-center justify-between">
          <View>
            <Text className="text-foreground text-[28px] font-bold tracking-tight">Schedule</Text>
            <Text className="text-muted-foreground text-sm mt-1">{events.length} events · {activeReminders.length} reminders</Text>
          </View>
          <Pressable onPress={() => router.push('/schedule/create')}
            className="w-11 h-11 rounded-2xl bg-primary items-center justify-center active:scale-[0.94]"
            style={{ shadowColor: '#B66A40', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4 }}>
            <PlusIcon size={20} className="text-white" />
          </Pressable>
        </View>

        {/* Month Calendar */}
        <View className="mx-5 mt-4 bg-card rounded-2xl p-4" style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 3 }}>
          {/* Month navigator */}
          <View className="flex-row items-center justify-between mb-4">
            <Pressable onPress={goPrevMonth} className="w-8 h-8 rounded-full bg-muted items-center justify-center active:scale-[0.92]">
              <Text className="text-foreground text-sm font-bold">‹</Text>
            </Pressable>
            <Text className="text-foreground text-base font-bold tracking-tight">{MONTHS[viewMonth]} {viewYear}</Text>
            <View className="flex-row items-center gap-2">
              <Pressable onPress={() => router.push('/schedule/calendar')} className="active:opacity-60">
                <Text className="text-primary text-xs font-semibold">Full</Text>
              </Pressable>
              <Pressable onPress={goNextMonth} className="w-8 h-8 rounded-full bg-muted items-center justify-center active:scale-[0.92]">
                <Text className="text-foreground text-sm font-bold">›</Text>
              </Pressable>
            </View>
          </View>
          {/* Day labels */}
          <View className="flex-row mb-1">
            {DAYS.map(d => (
              <View key={d} style={{ width: `${100/7}%` }} className="items-center py-1">
                <Text className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider">{d.slice(0,2)}</Text>
              </View>
            ))}
          </View>
          {/* Day cells */}
          <View className="flex-row flex-wrap">
            {monthGrid.map((cell, i) => {
              const key = dateKey(cell.year, cell.month, cell.day);
              const hasEvents = (eventsByDate[key]?.length || 0) > 0;
              const isSel = key === selectedDate;
              return (
                <Pressable key={i} onPress={() => { if (!cell.isOutside) { setSelectedDate(key); if (cell.month !== viewMonth) { setViewMonth(cell.month); setViewYear(cell.year); } } }}
                  style={{ width: `${100/7}%` }} className="items-center py-1.5">
                  <View className={`w-8 h-8 rounded-full items-center justify-center ${cell.isToday ? 'bg-primary' : isSel ? 'bg-primary/15' : ''}`}>
                    <Text className={`text-xs font-bold ${cell.isOutside ? 'text-muted-foreground/25' : cell.isToday ? 'text-white' : isSel ? 'text-primary' : 'text-foreground'}`}>
                      {cell.day}
                    </Text>
                  </View>
                  {hasEvents && !cell.isOutside && (
                    <View className="flex-row gap-0.5 mt-0.5">
                      {(eventsByDate[key] || []).slice(0,3).map((ev, j) => (
                        <View key={j} style={{ width: 3.5, height: 3.5, borderRadius: 2, backgroundColor: EVENT_COLORS[ev.event_type] || '#B66A40' }} />
                      ))}
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Selected Day Agenda */}
        <View className="px-5 mt-5">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-foreground text-lg font-bold tracking-tight">{labelForDate(selectedDate)}</Text>
            <Pressable onPress={() => router.push(`/schedule/agenda?date=${selectedDate}`)} className="flex-row items-center gap-1 active:opacity-60">
              <Text className="text-primary text-sm font-semibold">Agenda</Text>
              <ChevronRightIcon size={14} className="text-primary" />
            </Pressable>
          </View>
          {selectedEvents.length === 0 ? (
            <View className="bg-card rounded-2xl p-6 items-center gap-3">
              <View className="w-12 h-12 rounded-full bg-muted items-center justify-center"><CalendarDaysIcon size={22} className="text-muted-foreground" /></View>
              <Text className="text-muted-foreground text-sm font-medium">No events on this day</Text>
              <Pressable onPress={() => router.push(`/schedule/create?date=${selectedDate}`)} className="bg-primary rounded-xl px-5 py-2.5 flex-row items-center gap-2 active:scale-[0.96]">
                <PlusIcon size={15} className="text-white" />
                <Text className="text-white text-sm font-semibold">Add Event</Text>
              </Pressable>
            </View>
          ) : (
            <View className="bg-card rounded-2xl overflow-hidden" style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 3 }}>
              {selectedEvents.map((ev, i) => {
                const IconComp = EVENT_ICONS[ev.event_type] || CalendarDaysIcon;
                const color = EVENT_COLORS[ev.event_type] || '#B66A40';
                const evReminders = reminders.filter(r => r.schedule_event_id === ev.id);
                return (
                  <Pressable key={ev.id} onPress={() => router.push(`/schedule/${ev.id}`)}
                    className="px-4 py-3.5 flex-row items-center gap-3 active:bg-muted/30"
                    style={i < selectedEvents.length - 1 ? { borderBottomWidth: 1, borderBottomColor: '#F0E8E2' } : undefined}>
                    <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: `${color}18`, alignItems: 'center', justifyContent: 'center' }}>
                      <IconComp size={16} style={{ color }} />
                    </View>
                    <View className="flex-1 min-w-0">
                      <Text className="text-foreground text-sm font-bold" numberOfLines={1}>{ev.title}</Text>
                      <Text className="text-muted-foreground text-xs mt-0.5">{ev.event_type.charAt(0).toUpperCase() + ev.event_type.slice(1)}</Text>
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
                const color = EVENT_COLORS[ev.event_type] || '#B66A40';
                return (
                  <Pressable key={ev.id} onPress={() => router.push(`/schedule/${ev.id}`)}
                    className="bg-card rounded-2xl px-4 py-3 flex-row items-center gap-3 active:scale-[0.98]"
                    style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
                    <View style={{ width: 3, height: 32, borderRadius: 2, backgroundColor: color }} />
                    <View className="flex-1 min-w-0">
                      <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>{ev.title}</Text>
                      <Text className="text-muted-foreground text-xs mt-0.5">{labelForDate(ev.event_date)}{ev.event_time ? ` · ${formatTime(ev.event_time)}` : ''}</Text>
                    </View>
                    <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, backgroundColor: `${color}14` }}>
                      <Text style={{ color, fontSize: 9, fontWeight: '700', textTransform: 'uppercase' }}>{ev.event_type}</Text>
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
            <View className="bg-card rounded-2xl overflow-hidden" style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 3 }}>
              {activeReminders.slice(0, 4).map((rem, i) => (
                <Pressable key={rem.id} onPress={() => router.push(`/schedule/reminders/${rem.id}`)}
                  className="flex-row items-center gap-3 px-4 py-3 active:bg-muted/30"
                  style={i < Math.min(activeReminders.length, 4) - 1 ? { borderBottomWidth: 1, borderBottomColor: '#F0E8E2' } : undefined}>
                  <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: rem.is_alarm_enabled ? '#B66A4018' : '#A8948920', alignItems: 'center', justifyContent: 'center' }}>
                    {rem.is_alarm_enabled ? <BellIcon size={14} className="text-primary" /> : <BellOffIcon size={14} className="text-muted-foreground" />}
                  </View>
                  <View className="flex-1 min-w-0">
                    <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>{rem.title}</Text>
                    <View className="flex-row items-center gap-2 mt-0.5">
                      <Text className="text-muted-foreground text-xs">{new Date(rem.reminder_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Text>
                      {rem.has_push_notification && (
                        <View style={{ paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3, backgroundColor: '#5B7B9A18' }}>
                          <Text style={{ color: '#5B7B9A', fontSize: 8, fontWeight: '700' }}>PUSH</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <Pressable className="active:scale-[0.90]">
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
