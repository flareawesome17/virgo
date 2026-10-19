import { useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, SectionList, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { BellIcon, BellOffIcon, CheckCircleIcon, CircleIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { useAuth, useReminders, useTheme, useUpdateReminder } from '@/src/hooks';
import type { Reminder } from '@/src/api';
import { ScreenHeader } from '@/components/ScreenHeader';
import { LoadFailed } from '@/components/LoadFailed';
import { EmptyState } from '@/components/EmptyState';
import { PALETTES } from '@/theme';

for (const Icon of [BellIcon, BellOffIcon, CheckCircleIcon, CircleIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/** "Tue, Oct 6 · 4:30 PM" — the time is what decides whether it matters today. */
function when(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${day} · ${time}`;
}

/**
 * Every reminder, not only the next four.
 *
 * Schedule showed the four soonest and had no way to the rest. One whose time
 * had passed without being ticked dropped off it altogether — still waiting,
 * and impossible to tick off. Here they are: overdue first, then what is
 * coming, then what was done lately.
 */
export default function AllRemindersScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const [refreshing, setRefreshing] = useState(false);

  // Open ones, oldest first, so the overdue are not cut off by the limit.
  const open = useReminders(
    { is_completed: false, orderBy: 'reminder_time', direction: 'asc', limit: 100 },
    { enabled: !!user?.id },
  );
  const done = useReminders(
    { is_completed: true, orderBy: 'reminder_time', direction: 'desc', limit: 30 },
    { enabled: !!user?.id },
  );
  const update = useUpdateReminder();

  const sections = useMemo(() => {
    const now = Date.now();
    const overdue = open.reminders.filter((r) => Date.parse(r.reminder_time) < now);
    const upcoming = open.reminders.filter((r) => Date.parse(r.reminder_time) >= now);
    return [
      { key: 'overdue', title: `Overdue · ${overdue.length}`, data: overdue },
      { key: 'upcoming', title: 'Coming up', data: upcoming },
      { key: 'done', title: 'Done lately', data: done.reminders },
    ].filter((s) => s.data.length > 0);
  }, [open.reminders, done.reminders]);

  const toggle = (r: Reminder) =>
    update.mutate(
      { id: r.id, is_completed: !r.is_completed },
      {
        onError: (error) =>
          Alert.alert("Couldn't update it", error instanceof Error ? error.message : 'Please try again.'),
      },
    );

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([open.refetch(), done.refetch()]);
    setRefreshing(false);
  };

  const loading = open.isLoading && done.isLoading;
  const failed = open.loadFailed && open.reminders.length === 0;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScreenHeader
        title="Reminders"
        right={
          <Pressable
            onPress={() => router.push('/schedule/reminders/create')}
            accessibilityRole="button"
            accessibilityLabel="New reminder"
            className="min-h-[44px] px-2 justify-center active:opacity-60"
          >
            <Text className="text-primary text-sm font-bold">+ New</Text>
          </Pressable>
        }
      />
      {failed ? (
        <LoadFailed what="your reminders" onRetry={() => void open.refetch()} />
      ) : !loading && sections.length === 0 ? (
        <View className="flex-1 justify-center">
          <EmptyState
            icon={BellIcon}
            title="No reminders"
            body="Set one for an invoice, a card backup or anything else that belongs to no event."
            action={{ label: 'New reminder', onPress: () => router.push('/schedule/reminders/create') }}
          />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(r) => r.id}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={palette.primary} />}
          renderSectionHeader={({ section }) => (
            <Text
              accessibilityRole="header"
              className={`text-[12px] font-bold uppercase tracking-[1.5px] mt-5 mb-2 ml-1 ${section.key === 'overdue' ? 'text-destructive' : 'text-muted-foreground'}`}
            >
              {section.title}
            </Text>
          )}
          renderItem={({ item, index, section }) => {
            const first = index === 0;
            const last = index === section.data.length - 1;
            return (
              <View
                className={`bg-card flex-row items-center gap-3 pl-4 ${first ? 'rounded-t-2xl' : ''} ${last ? 'rounded-b-2xl' : 'border-b border-border'}`}
              >
                <Pressable
                  onPress={() => router.push(`/schedule/reminders/${item.id}`)}
                  accessibilityRole="button"
                  className="flex-1 flex-row items-center gap-3 py-3 min-h-[56px] active:opacity-70"
                >
                  <View className="w-8 h-8 rounded-[10px] bg-primary/10 items-center justify-center">
                    {item.is_alarm_enabled ? (
                      <BellIcon size={14} className="text-primary" />
                    ) : (
                      <BellOffIcon size={14} className="text-muted-foreground" />
                    )}
                  </View>
                  <View className="flex-1 min-w-0">
                    <Text
                      className={`text-[15px] font-semibold ${item.is_completed ? 'text-muted-foreground line-through' : 'text-foreground'}`}
                      numberOfLines={1}
                    >
                      {item.title}
                    </Text>
                    <Text
                      className={`text-[13px] mt-0.5 ${section.key === 'overdue' ? 'text-destructive' : 'text-muted-foreground'}`}
                    >
                      {when(item.reminder_time)}
                    </Text>
                  </View>
                </Pressable>
                <Pressable
                  onPress={() => toggle(item)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: item.is_completed }}
                  accessibilityLabel={`${item.title}, done`}
                  className="w-12 h-12 items-center justify-center active:opacity-60"
                >
                  {item.is_completed ? (
                    <CheckCircleIcon size={20} className="text-success" />
                  ) : (
                    <CircleIcon size={20} className="text-muted-foreground" />
                  )}
                </Pressable>
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
