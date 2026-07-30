import { View, Text, ScrollView, RefreshControl, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApp, useAuth, useTheme } from '@/src/hooks';
import { useLocalSearchParams, router } from 'expo-router';
import { useState } from 'react';
import {
  ArrowLeftIcon, ClockIcon, CalendarDaysIcon, BellIcon, BellOffIcon,
  CameraIcon, ScissorsIcon, EyeIcon, PackageIcon, PresentationIcon,
  CheckCircleIcon, CircleIcon, PlusIcon, Trash2Icon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ClockIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CalendarDaysIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(BellIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(BellOffIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CameraIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ScissorsIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(EyeIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(PackageIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(PresentationIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CheckCircleIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CircleIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(PlusIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(Trash2Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

const EVENT_ICONS: Record<string, React.ComponentType<any>> = {
  shoot: CameraIcon, editing: ScissorsIcon, review: EyeIcon,
  delivery: PackageIcon, meeting: PresentationIcon,
};
const EVENT_COLORS: Record<string, string> = {
  shoot: '#B66A40', editing: '#C17745', review: '#8B5E3C',
  delivery: '#6B8E4E', meeting: '#5B7B9A',
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
  const { client } = useApp();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { data: event } = useQuery({
    queryKey: ['schedule_event', eventId],
    queryFn: async () => {
      const { data, error } = await client.from('schedule_events').select('*').eq('id', eventId).single();
      if (error) throw error; return data;
    },
    enabled: !!eventId,
  });

  const { data: workspace } = useQuery({
    queryKey: ['workspace', event?.workspace_id],
    queryFn: async () => {
      if (!event?.workspace_id) return null;
      const { data } = await client.from('workspaces').select('id, name, accent_color').eq('id', event.workspace_id).single();
      return data;
    },
    enabled: !!event?.workspace_id,
  });

  const { data: reminders = [] } = useQuery({
    queryKey: ['reminders', eventId],
    queryFn: async () => {
      const { data, error } = await client.from('reminders').select('*').eq('schedule_event_id', eventId).order('reminder_time', { ascending: true });
      if (error) throw error; return data ?? [];
    },
    enabled: !!eventId,
  });

  const toggleReminder = useMutation({
    mutationFn: async ({ id, is_completed }: { id: string; is_completed: boolean }) => {
      const { error } = await client.from('reminders').update({ is_completed }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reminders'] }),
  });

  const deleteEvent = useMutation({
    mutationFn: async () => {
      const { error } = await client.from('schedule_events').delete().eq('id', eventId);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['schedule_events'] }); router.back(); },
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['schedule_event', eventId] });
    await queryClient.invalidateQueries({ queryKey: ['reminders'] });
    setRefreshing(false);
  };

  if (!event) {
    return <SafeAreaView edges={['top']} className="flex-1 bg-background"><View className="flex-1 items-center justify-center"><Text className="text-muted-foreground text-sm">Loading...</Text></View></SafeAreaView>;
  }

  const color = EVENT_COLORS[event.event_type] || '#B66A40';
  const IconComp = EVENT_ICONS[event.event_type] || CalendarDaysIcon;
  const wsAccent = workspace?.accent_color || color;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={isDark ? '#C17745' : '#B66A40'} />}>

        {/* Hero color block */}
        <View style={{ backgroundColor: `${color}14`, paddingTop: 4, paddingBottom: 24, paddingHorizontal: 20 }}>
          <Pressable onPress={() => router.back()} className="w-10 h-10 rounded-2xl bg-white items-center justify-center mb-4 active:scale-[0.94]"
            style={{ shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
            <ArrowLeftIcon size={18} style={{ color: '#1E1B18' }} />
          </Pressable>
          <View className="flex-row items-center gap-4">
            <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: `${color}22`, alignItems: 'center', justifyContent: 'center' }}>
              <IconComp size={26} style={{ color }} />
            </View>
            <View className="flex-1">
              <Text className="text-foreground text-[20px] font-bold tracking-tight">{event.title}</Text>
              <View className="flex-row items-center gap-2 mt-1.5">
                <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: `${color}22` }}>
                  <Text style={{ color, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 }}>{event.event_type}</Text>
                </View>
                {workspace && (
                  <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: `${wsAccent}15` }}>
                    <Text style={{ color: wsAccent, fontSize: 11, fontWeight: '600' }}>{workspace.name}</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        </View>

        {/* Details card */}
        <View className="mx-5 -mt-3 bg-card rounded-2xl p-4 flex-row items-center gap-4" style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 3 }}>
          <View className="flex-row items-center gap-2 flex-1">
            <CalendarDaysIcon size={14} style={{ color }} />
            <View>
              <Text className="text-muted-foreground text-[10px] font-semibold uppercase">Date</Text>
              <Text className="text-foreground text-sm font-bold">{formatDateFull(event.event_date)}</Text>
            </View>
          </View>
          {event.event_time && (
            <View className="flex-row items-center gap-2">
              <ClockIcon size={14} style={{ color }} />
              <View>
                <Text className="text-muted-foreground text-[10px] font-semibold uppercase">Time</Text>
                <Text className="text-foreground text-sm font-bold">{formatTime(event.event_time)}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Description */}
        {event.description && (
          <View className="mx-5 mt-4 bg-card rounded-2xl p-4" style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
            <Text className="text-muted-foreground text-[10px] font-bold uppercase tracking-[1.5px] mb-2">Description</Text>
            <Text className="text-foreground text-sm leading-relaxed">{event.description}</Text>
          </View>
        )}

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
                  style={i < reminders.length - 1 ? { borderBottomWidth: 1, borderBottomColor: '#F0E8E2' } : undefined}>
                  <Pressable onPress={() => toggleReminder.mutate({ id: rem.id, is_completed: !rem.is_completed })} className="active:scale-[0.85]">
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

        {/* Delete */}
        <View className="px-5 mt-8">
          <Pressable onPress={() => deleteEvent.mutate()} className="flex-row items-center justify-center gap-2 py-3 active:scale-[0.97]">
            <Trash2Icon size={15} className="text-destructive" />
            <Text className="text-destructive text-sm font-semibold">Delete Event</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
