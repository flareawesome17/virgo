import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useApp, useAuth, useTheme } from '@/src/hooks';
import { useState, useMemo } from 'react';
import { router } from 'expo-router';
import {
  ArrowLeftIcon, PlusIcon, CalendarDaysIcon,
  CameraIcon, ScissorsIcon, EyeIcon, PackageIcon, PresentationIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(PlusIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CalendarDaysIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CameraIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ScissorsIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(EyeIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(PackageIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(PresentationIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

const EVENT_ICONS: Record<string, React.ComponentType<any>> = {
  shoot: CameraIcon, editing: ScissorsIcon, review: EyeIcon,
  delivery: PackageIcon, meeting: PresentationIcon,
};
const EVENT_COLORS: Record<string, string> = {
  shoot: '#B66A40', editing: '#C17745', review: '#8B5E3C',
  delivery: '#6B8E4E', meeting: '#5B7B9A',
};

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
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
    cells.push({ day: d, month, year, isToday: today.getFullYear() === year && today.getMonth() === month && today.getDate() === d, isOutside: false });
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
  const hour = parseInt(h), ampm = hour >= 12 ? 'PM' : 'AM', h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

export default function CalendarScreen() {
  const { client } = useApp();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState(dateKey(today.getFullYear(), today.getMonth(), today.getDate()));

  const { data: events = [] } = useQuery({
    queryKey: ['schedule_events', user?.id],
    queryFn: async () => {
      const { data, error } = await client.from('schedule_events')
        .select('*').eq('user_id', user?.id).order('event_date', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  const eventsByDate = useMemo(() => {
    const m: Record<string, typeof events> = {};
    for (const ev of events) { if (!m[ev.event_date]) m[ev.event_date] = []; m[ev.event_date].push(ev); }
    return m;
  }, [events]);

  const monthGrid = getMonthGrid(viewYear, viewMonth);
  const selectedEvents = eventsByDate[selectedDate] || [];
  const isSelToday = selectedDate === dateKey(today.getFullYear(), today.getMonth(), today.getDate());

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
          <Pressable onPress={() => router.push('/schedule/create')} className="w-11 h-11 rounded-2xl bg-primary items-center justify-center active:scale-[0.94]"
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
            <Text className="text-foreground text-lg font-extrabold tracking-tight">{MONTHS[viewMonth]} {viewYear}</Text>
            <Pressable onPress={goNext} className="w-10 h-10 rounded-full bg-muted items-center justify-center active:scale-[0.92]">
              <Text className="text-foreground text-lg font-bold">›</Text>
            </Pressable>
          </View>
          {/* Day labels */}
          <View className="flex-row mb-2">
            {DAYS.map(d => (
              <View key={d} style={{ width: `${100/7}%` }} className="items-center py-1">
                <Text className="text-muted-foreground text-[10px] font-bold uppercase tracking-[1.5px]">{d.slice(0,2)}</Text>
              </View>
            ))}
          </View>
          {/* Grid */}
          <View className="flex-row flex-wrap">
            {monthGrid.map((cell, i) => {
              const key = dateKey(cell.year, cell.month, cell.day);
              const dayEvents = eventsByDate[key] || [];
              const has = dayEvents.length > 0;
              const isSel = key === selectedDate && !cell.isOutside;
              return (
                <Pressable key={i} onPress={() => { if (!cell.isOutside) setSelectedDate(key); }}
                  style={{ width: `${100/7}%` }} className="items-center pt-1 pb-2">
                  <View className={`w-9 h-9 rounded-xl items-center justify-center mb-1 ${
                    cell.isToday ? 'bg-primary' : isSel ? 'bg-primary/10' : ''}`}>
                    <Text className={`text-sm font-bold ${cell.isOutside ? 'text-muted-foreground/20' : cell.isToday ? 'text-white' : isSel ? 'text-primary' : 'text-foreground'}`}>
                      {cell.day}
                    </Text>
                  </View>
                  {has && !cell.isOutside && (
                    <View className="flex-row gap-[1.5px]">
                      {dayEvents.slice(0,4).map((ev, j) => (
                        <View key={j} style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: EVENT_COLORS[ev.event_type] || '#B66A40' }} />
                      ))}
                      {dayEvents.length > 4 && <Text className="text-muted-foreground text-[7px] font-bold">+{dayEvents.length - 4}</Text>}
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
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
              <Pressable onPress={() => router.push(`/schedule/create?date=${selectedDate}`)} className="bg-primary rounded-xl px-5 py-3 flex-row items-center gap-2 active:scale-[0.96]">
                <PlusIcon size={16} className="text-white" />
                <Text className="text-white text-sm font-semibold">Add Event</Text>
              </Pressable>
            </View>
          ) : (
            <View className="gap-2">
              {selectedEvents.map(ev => {
                const IconComp = EVENT_ICONS[ev.event_type] || CalendarDaysIcon;
                const color = EVENT_COLORS[ev.event_type] || '#B66A40';
                return (
                  <Pressable key={ev.id} onPress={() => router.push(`/schedule/${ev.id}`)}
                    className="bg-card rounded-2xl p-4 flex-row items-center gap-4 active:scale-[0.98]"
                    style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
                    <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: `${color}18`, alignItems: 'center', justifyContent: 'center' }}>
                      <IconComp size={18} style={{ color }} />
                    </View>
                    <View className="flex-1 min-w-0">
                      <Text className="text-foreground text-sm font-bold" numberOfLines={1}>{ev.title}</Text>
                      {ev.description ? <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>{ev.description}</Text> : null}
                      <View className="flex-row items-center gap-3 mt-2">
                        <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, backgroundColor: `${color}14` }}>
                          <Text style={{ color, fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 }}>{ev.event_type}</Text>
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
