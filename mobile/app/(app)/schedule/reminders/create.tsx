import { View, Text, ScrollView, Pressable, TextInput, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCreateReminder, useScheduleEvent } from '@/src/hooks';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ArrowLeftIcon,
  BellIcon,
  BellOffIcon,
  ToggleLeftIcon,
  ToggleRightIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { DateTimeField } from '@/components';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(BellIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(BellOffIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ToggleLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ToggleRightIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

/**
 * New reminder, optionally attached to a schedule event.
 *
 * This file also disambiguates the route: without it, `/schedule/reminders/create`
 * matched `[reminderId].tsx` with reminderId="create", so the app tried to load a
 * reminder called "create" and sat on "Loading..." forever. A static segment wins
 * over a dynamic one in Expo Router, so this now resolves correctly.
 */
export default function CreateReminderScreen() {
  const insets = useSafeAreaInsets();
  const { eventId } = useLocalSearchParams<{ eventId?: string }>();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  // A single Date backs both pickers. This was two hand-typed strings that had
  // to be validated with regexes and could still parse to Invalid Date.
  const [when, setWhen] = useState(() => {
    const d = new Date();
    d.setHours(9, 0, 0, 0);
    return d;
  });
  const [alarmEnabled, setAlarmEnabled] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(true);

  // Shown for context when arriving from an event; the link itself is carried
  // by the eventId query parameter.
  const { data: event } = useScheduleEvent(eventId);

  const createReminder = useCreateReminder();

  const canSave = title.trim().length > 0;

  const handleCreate = () => {
    if (!canSave) return;

    createReminder.mutate(
      {
        title: title.trim(),
        description: description.trim() || null,
        // reminder_time is timestamptz. `when` is a local Date, so toISOString
        // keeps "9am" meaning 9am where the user is, rather than 9am UTC.
        reminder_time: when.toISOString(),
        is_alarm_enabled: alarmEnabled,
        has_push_notification: pushEnabled,
        is_completed: false,
        // Omitted rather than null when absent — the API rejects an explicit
        // null for an optional string.
        ...(eventId ? { schedule_event_id: eventId } : {}),
      },
      {
        onSuccess: () => router.back(),
        onError: (err: any) =>
          Alert.alert(
            'Could not create reminder',
            err?.message || 'Something went wrong. Please try again.',
          ),
      },
    );
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      {/* Lifts the form above the keyboard. Without this the fields nearest
          the bottom sat underneath it on iOS with no way to scroll to them. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 140 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="px-5 pt-4 pb-2 flex-row items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            className="w-10 h-10 rounded-2xl bg-card items-center justify-center active:scale-[0.94]"
            style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}
          >
            <ArrowLeftIcon size={18} className="text-foreground" />
          </Pressable>
          <View>
            <Text className="text-foreground text-[22px] font-bold tracking-tight">New Reminder</Text>
            {event ? (
              <Text className="text-muted-foreground text-sm mt-0.5" numberOfLines={1}>
                for {event.title}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Title */}
        <View className="px-5 mt-5">
          <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">Title</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Pack lighting kit"
            placeholderTextColor="#A89489"
            className="bg-card rounded-2xl px-4 py-3.5 text-foreground text-base"
            style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}
            autoFocus
          />
        </View>

        {/* Description */}
        <View className="px-5 mt-4">
          <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">
            Notes <Text className="font-medium normal-case tracking-normal">(optional)</Text>
          </Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Anything worth remembering..."
            placeholderTextColor="#A89489"
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            className="bg-card rounded-2xl px-4 py-3.5 text-foreground text-base"
            style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2, minHeight: 72 }}
          />
        </View>

        {/* Date & time — native pickers, so the value is always a real date. */}
        <View className="px-5 mt-5 flex-row gap-3">
          <DateTimeField label="Date" mode="date" value={when} onChange={setWhen} />
          <DateTimeField label="Time" mode="time" value={when} onChange={setWhen} />
        </View>

        {/* Toggles */}
        <View className="px-5 mt-5">
          <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-3 ml-1">Alerts</Text>

          <Pressable
            onPress={() => setAlarmEnabled((v) => !v)}
            className="bg-card rounded-2xl px-4 py-3.5 flex-row items-center gap-3 active:scale-[0.98]"
            style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}
          >
            {alarmEnabled ? (
              <BellIcon size={17} className="text-primary" />
            ) : (
              <BellOffIcon size={17} className="text-muted-foreground" />
            )}
            <View className="flex-1">
              <Text className="text-foreground text-sm font-semibold">Alarm</Text>
              <Text className="text-muted-foreground text-xs mt-0.5">Play a sound at the reminder time</Text>
            </View>
            {alarmEnabled ? (
              <ToggleRightIcon size={26} className="text-primary" />
            ) : (
              <ToggleLeftIcon size={26} className="text-muted-foreground" />
            )}
          </Pressable>

          <Pressable
            onPress={() => setPushEnabled((v) => !v)}
            className="bg-card rounded-2xl px-4 py-3.5 flex-row items-center gap-3 active:scale-[0.98] mt-3"
            style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}
          >
            <BellIcon size={17} className={pushEnabled ? 'text-primary' : 'text-muted-foreground'} />
            <View className="flex-1">
              <Text className="text-foreground text-sm font-semibold">Push notification</Text>
              <Text className="text-muted-foreground text-xs mt-0.5">Send a notification to this device</Text>
            </View>
            {pushEnabled ? (
              <ToggleRightIcon size={26} className="text-primary" />
            ) : (
              <ToggleLeftIcon size={26} className="text-muted-foreground" />
            )}
          </Pressable>
        </View>
      </ScrollView>

      {/* Actions */}
      <View className="absolute bottom-0 left-0 right-0 px-5 pt-3 bg-background flex-row gap-3" style={{ paddingBottom: insets.bottom + 16 }}>
        <Pressable
          onPress={() => router.back()}
          className="flex-1 rounded-2xl py-3.5 items-center bg-card active:scale-[0.97]"
          style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}
        >
          <Text className="text-foreground text-base font-bold">Cancel</Text>
        </Pressable>
        <Pressable
          onPress={handleCreate}
          disabled={!canSave || createReminder.isPending}
          className={`flex-[2] rounded-2xl py-3.5 items-center active:scale-[0.97] ${canSave ? 'bg-primary' : 'bg-muted'}`}
        >
          <Text className={`text-base font-bold ${canSave ? 'text-white' : 'text-muted-foreground'}`}>
            {createReminder.isPending ? 'Creating...' : 'Create Reminder'}
          </Text>
        </Pressable>
      </View>
          </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
