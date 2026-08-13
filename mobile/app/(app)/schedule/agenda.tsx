import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth, useReminders, useScheduleEventRange, useTheme } from '@/src/hooks';
import { useLocalSearchParams, router } from 'expo-router';
import {
  ArrowLeftIcon, PlusIcon, CalendarDaysIcon, ClockIcon, BellIcon,
  CameraIcon, ScissorsIcon, EyeIcon, PackageIcon, PresentationIcon,
  type LucideIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { eventColor } from '@/src/lib/calendar';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(PlusIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CalendarDaysIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ClockIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(BellIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CameraIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ScissorsIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(EyeIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(PackageIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(PresentationIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

const EVENT_ICONS: Record<string, LucideIcon> = {
  shoot: CameraIcon, editing: ScissorsIcon, review: EyeIcon,
  delivery: PackageIcon, meeting: PresentationIcon,
};
function formatTime(timeStr: string | null): string {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':');
  const hour = parseInt(h), ampm = hour >= 12 ? 'PM' : 'AM', h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}
function isTodayDate(dateStr: string): boolean { return new Date(dateStr).toDateString() === new Date().toDateString(); }
function isTomorrowDate(dateStr: string): boolean { const t = new Date(); t.setDate(t.getDate() + 1); return new Date(dateStr).toDateString() === t.toDateString(); }
function dateLabel(dateStr: string): string {
  if (isTodayDate(dateStr)) return 'Today';
  if (isTomorrowDate(dateStr)) return 'Tomorrow';
  return new Date(dateStr).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

// Build timeline slots
const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 6 AM to 11 PM

export default function AgendaScreen() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const { user } = useAuth();
  const { isDark } = useTheme();

  // A single-day agenda is the range endpoint with from == to; it already
  // orders by event_date then event_time, which is what this screen wants.
  const { events } = useScheduleEventRange(date, date);

  const { reminders } = useReminders(
    { orderBy: 'reminder_time', direction: 'asc', limit: 100 },
    { enabled: !!user?.id },
  );

  const dayReminders = reminders.filter(r => {
    const rt = new Date(r.reminder_time);
    return rt.toISOString().slice(0, 10) === date;
  });

  const eventsByHour: Record<number, typeof events> = {};
  for (const ev of events) {
    const hour = ev.event_time ? parseInt(ev.event_time.split(':')[0]) : -1;
    if (!eventsByHour[hour]) eventsByHour[hour] = [];
    eventsByHour[hour].push(ev);
  }

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
            <Text className="text-foreground text-[22px] font-bold tracking-tight">{date ? dateLabel(date) : 'Agenda'}</Text>
            <Text className="text-muted-foreground text-sm mt-0.5">{events.length} events · {dayReminders.length} reminders</Text>
          </View>
          <Pressable onPress={() => router.push(`/schedule/create?date=${date}`)} className="w-11 h-11 rounded-2xl bg-primary items-center justify-center active:scale-[0.94]"
            style={{ shadowColor: '#B66A40', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4 }}>
            <PlusIcon size={20} className="text-white" />
          </Pressable>
        </View>

        {/* Timeline */}
        <View className="px-5 mt-5">
          {HOURS.map((hour) => {
            const hourEvents = eventsByHour[hour] || [];
            const ampm = hour >= 12 ? 'PM' : 'AM';
            const h12 = hour % 12 || 12;
            const label = `${h12}:00 ${ampm}`;
            const now = new Date();
            const isNow = date && isTodayDate(date) && now.getHours() === hour;

            return (
              <View key={hour} className="flex-row gap-3 min-h-[48px]">
                {/* Time label */}
                <View className="w-[52px] items-end pt-1">
                  <Text className={`text-xs font-bold ${isNow ? 'text-primary' : 'text-muted-foreground'}`}>{label}</Text>
                  {isNow && <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: '#B66A40', marginTop: 2 }} />}
                </View>
                {/* Events column */}
                <View className="flex-1 pb-3" style={hour < 23 ? { borderLeftWidth: 1, borderLeftColor: isDark ? '#2A2522' : '#F0E8E2' } : undefined}>
                  {hourEvents.length > 0 ? (
                    <View className="ml-3 gap-2">
                      {hourEvents.map(ev => {
                        const IconComp = EVENT_ICONS[ev.event_type] || CalendarDaysIcon;
                        const color = eventColor(ev.event_type);
                        return (
                          <Pressable key={ev.id} onPress={() => router.push(`/schedule/${ev.id}`)}
                            className="bg-card rounded-2xl p-3 flex-row items-center gap-3 active:scale-[0.98]"
                            style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
                            <View style={{ width: 3, height: 34, borderRadius: 2, backgroundColor: color }} />
                            <View className="flex-1 min-w-0">
                              <Text className="text-foreground text-sm font-bold" numberOfLines={1}>{ev.title}</Text>
                              {ev.description ? <Text className="text-muted-foreground text-[11px] mt-0.5" numberOfLines={1}>{ev.description}</Text> : null}
                            </View>
                            <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, backgroundColor: `${color}14` }}>
                              <Text style={{ color, fontSize: 9, fontWeight: '700', textTransform: 'uppercase' }}>{ev.event_type}</Text>
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : (
                    <View className="ml-3 h-6" />
                  )}
                </View>
              </View>
            );
          })}
        </View>

        {/* Reminders for this day */}
        {dayReminders.length > 0 && (
          <View className="px-5 mt-6">
            <Text className="text-foreground text-base font-bold tracking-tight mb-3">Reminders</Text>
            <View className="bg-card rounded-2xl overflow-hidden" style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
              {dayReminders.map((rem, i) => (
                <Pressable key={rem.id} onPress={() => router.push(`/schedule/reminders/${rem.id}`)}
                  className="flex-row items-center gap-3 px-4 py-3 active:bg-muted/30"
                  style={i < dayReminders.length - 1 ? { borderBottomWidth: 1, borderBottomColor: isDark ? '#2A2522' : '#F0E8E2' } : undefined}>
                  <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: rem.is_alarm_enabled ? '#B66A4018' : '#A8948920', alignItems: 'center', justifyContent: 'center' }}>
                    {rem.is_alarm_enabled ? <BellIcon size={13} className="text-primary" /> : <BellIcon size={13} className="text-muted-foreground" />}
                  </View>
                  <View className="flex-1 min-w-0">
                    <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>{rem.title}</Text>
                    <Text className="text-muted-foreground text-xs mt-0.5">{formatTime(new Date(rem.reminder_time).toTimeString().slice(0,5))}</Text>
                  </View>
                  {rem.has_push_notification && (
                    <View style={{ paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3, backgroundColor: '#5B7B9A18' }}>
                      <Text style={{ color: '#5B7B9A', fontSize: 8, fontWeight: '700' }}>PUSH</Text>
                    </View>
                  )}
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
