import { View, Text, ScrollView, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { UpdateReminderInput } from '@/src/api';
import {
  useDeleteReminder,
  useReminder,
  useScheduleEvent,
  useTheme,
  useUpdateReminder,
} from '@/src/hooks';
import { useLocalSearchParams, router } from 'expo-router';
import { useState } from 'react';
import {
  ArrowLeftIcon, BellIcon, BellOffIcon, ClockIcon, CalendarDaysIcon,
  ToggleLeftIcon, ToggleRightIcon, Trash2Icon, CheckCircleIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(BellIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(BellOffIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ClockIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CalendarDaysIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ToggleLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ToggleRightIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(Trash2Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CheckCircleIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

function formatDateTime(ts: string): { date: string; time: string } {
  const d = new Date(ts);
  return {
    date: d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
    time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
  };
}

export default function ReminderDetailScreen() {
  const { reminderId } = useLocalSearchParams<{ reminderId: string }>();
  const { isDark } = useTheme();
  const [refreshing, setRefreshing] = useState(false);

  const { data: reminder, refetch: refetchReminder } = useReminder(reminderId);

  const { data: event } = useScheduleEvent(
    reminder?.schedule_event_id ?? undefined,
  );

  // The id is injected here so call sites stay as plain partial updates.
  const updateReminderMutation = useUpdateReminder();
  const updateReminder = (updates: UpdateReminderInput) =>
    updateReminderMutation.mutate({ id: reminderId, ...updates });

  const deleteReminderMutation = useDeleteReminder();
  const deleteReminder = () =>
    deleteReminderMutation.mutate(reminderId, {
      onSuccess: () => router.back(),
    });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetchReminder();
    setRefreshing(false);
  };

  if (!reminder) {
    return <SafeAreaView edges={['top']} className="flex-1 bg-background"><View className="flex-1 items-center justify-center"><Text className="text-muted-foreground text-sm">Loading...</Text></View></SafeAreaView>;
  }

  const { date, time } = formatDateTime(reminder.reminder_time);
  const isPast = new Date(reminder.reminder_time) < new Date();

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={isDark ? '#C17745' : '#B66A40'}
          />
        }>
        {/* Header */}
        <View className="px-5 pt-4 pb-2 flex-row items-center gap-3">
          <Pressable onPress={() => router.back()} className="w-10 h-10 rounded-2xl bg-card items-center justify-center active:scale-[0.94]"
            style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
            <ArrowLeftIcon size={18} className="text-foreground" />
          </Pressable>
          <Text className="text-foreground text-[22px] font-bold tracking-tight">Reminder</Text>
        </View>

        {/* Hero card */}
        <View className="mx-5 mt-3 bg-card rounded-2xl p-5" style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 }}>
          <View className="flex-row items-center gap-4 mb-4">
            <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: reminder.is_alarm_enabled ? '#B66A4018' : '#A8948920', alignItems: 'center', justifyContent: 'center' }}>
              {reminder.is_completed ? <CheckCircleIcon size={24} className="text-[#6B8E4E]" /> :
                reminder.is_alarm_enabled ? <BellIcon size={22} className="text-primary" /> :
                <BellOffIcon size={22} className="text-muted-foreground" />}
            </View>
            <View className="flex-1">
              <Text className={`text-lg font-bold ${reminder.is_completed ? 'text-muted-foreground' : 'text-foreground'}`}>{reminder.title}</Text>
              <View className="flex-row items-center gap-2 mt-1">
                {reminder.is_completed ? (
                  <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, backgroundColor: '#6B8E4E18' }}>
                    <Text style={{ color: '#6B8E4E', fontSize: 10, fontWeight: '700' }}>COMPLETED</Text>
                  </View>
                ) : isPast ? (
                  <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, backgroundColor: '#C76B4A18' }}>
                    <Text style={{ color: '#C76B4A', fontSize: 10, fontWeight: '700' }}>OVERDUE</Text>
                  </View>
                ) : null}
              </View>
            </View>
          </View>

          {/* DateTime */}
          <View className="flex-row items-center gap-4 mt-1">
            <View className="flex-row items-center gap-2 flex-1">
              <CalendarDaysIcon size={15} className="text-primary" />
              <View>
                <Text className="text-muted-foreground text-[10px] font-semibold uppercase">Date</Text>
                <Text className="text-foreground text-sm font-bold">{date}</Text>
              </View>
            </View>
            <View className="flex-row items-center gap-2">
              <ClockIcon size={15} className="text-primary" />
              <View>
                <Text className="text-muted-foreground text-[10px] font-semibold uppercase">Time</Text>
                <Text className="text-foreground text-sm font-bold">{time}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Description */}
        {reminder.description && (
          <View className="mx-5 mt-4 bg-card rounded-2xl p-4" style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
            <Text className="text-muted-foreground text-[10px] font-bold uppercase tracking-[1.5px] mb-2">Notes</Text>
            <Text className="text-foreground text-sm leading-relaxed">{reminder.description}</Text>
          </View>
        )}

        {/* Linked Event */}
        {event && (
          <Pressable onPress={() => router.push(`/schedule/${event.id}`)} className="mx-5 mt-4 bg-card rounded-2xl p-4 flex-row items-center gap-3 active:scale-[0.98]"
            style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
            <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: '#B66A4018', alignItems: 'center', justifyContent: 'center' }}>
              <BellIcon size={15} className="text-primary" />
            </View>
            <View className="flex-1">
              <Text className="text-muted-foreground text-[10px] font-bold uppercase">Linked Event</Text>
              <Text className="text-foreground text-sm font-semibold">{event.title}</Text>
            </View>
          </Pressable>
        )}

        {/* Toggles */}
        <View className="mx-5 mt-5 bg-card rounded-2xl overflow-hidden" style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
          {/* Alarm toggle */}
          <Pressable onPress={() => updateReminder({ is_alarm_enabled: !reminder.is_alarm_enabled })}
            className="flex-row items-center justify-between px-4 py-3.5 active:bg-muted/30" style={{ borderBottomWidth: 1, borderBottomColor: isDark ? '#2A2522' : '#F0E8E2' }}>
            <View className="flex-row items-center gap-3">
              <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: reminder.is_alarm_enabled ? '#B66A4018' : '#A8948920', alignItems: 'center', justifyContent: 'center' }}>
                {reminder.is_alarm_enabled ? <BellIcon size={14} className="text-primary" /> : <BellOffIcon size={14} className="text-muted-foreground" />}
              </View>
              <View>
                <Text className="text-foreground text-sm font-semibold">Alarm</Text>
                <Text className="text-muted-foreground text-xs mt-0.5">{reminder.is_alarm_enabled ? 'Sound alert will play' : 'No sound alert'}</Text>
              </View>
            </View>
            <View style={{ width: 40, height: 22, borderRadius: 11, backgroundColor: reminder.is_alarm_enabled ? '#B66A40' : '#D9C2B7', padding: 3, alignItems: reminder.is_alarm_enabled ? 'flex-end' : 'flex-start', justifyContent: 'center' }}>
              <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: '#FFFFFF' }} />
            </View>
          </Pressable>
          {/* Push notification toggle */}
          <Pressable onPress={() => updateReminder({ has_push_notification: !reminder.has_push_notification })}
            className="flex-row items-center justify-between px-4 py-3.5 active:bg-muted/30">
            <View className="flex-row items-center gap-3">
              <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: '#5B7B9A18', alignItems: 'center', justifyContent: 'center' }}>
                <BellIcon size={14} color="#5B7B9A" />
              </View>
              <View>
                <Text className="text-foreground text-sm font-semibold">Push Notification</Text>
                <Text className="text-muted-foreground text-xs mt-0.5">{reminder.has_push_notification ? 'Will send push alert' : 'No push alert'}</Text>
              </View>
            </View>
            <View style={{ width: 40, height: 22, borderRadius: 11, backgroundColor: reminder.has_push_notification ? '#5B7B9A' : '#D9C2B7', padding: 3, alignItems: reminder.has_push_notification ? 'flex-end' : 'flex-start', justifyContent: 'center' }}>
              <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: '#FFFFFF' }} />
            </View>
          </Pressable>
        </View>

        {/* Mark Complete / Delete */}
        <View className="px-5 mt-6 gap-3">
          <Pressable onPress={() => updateReminder({ is_completed: !reminder.is_completed })}
            className={`rounded-2xl py-3.5 items-center active:scale-[0.97] ${reminder.is_completed ? 'bg-muted' : 'bg-[#6B8E4E]'}`}>
            <Text className={`text-base font-bold ${reminder.is_completed ? 'text-muted-foreground' : 'text-white'}`}>
              {reminder.is_completed ? 'Mark Incomplete' : 'Mark Complete'}
            </Text>
          </Pressable>
          <Pressable onPress={() => deleteReminder()} className="flex-row items-center justify-center gap-2 py-3 active:scale-[0.97]">
            <Trash2Icon size={15} className="text-destructive" />
            <Text className="text-destructive text-sm font-semibold">Delete Reminder</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
