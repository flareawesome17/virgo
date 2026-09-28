import { View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { AppTopBar, JobsTabs } from '@/components';
import { useMarkJobsSeen, useUnseenJobs } from '@/src/hooks';
import { PlusIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';

cssInterop(PlusIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

/**
 * The jobs board, as a screen of its own.
 *
 * It used to be half of the Home screen, behind a segmented control — which
 * meant the board had no address, and the bottom bar said nothing about where
 * the most active part of the app was. It is a tab route rather than a pushed
 * screen so the bottom bar stays put: leaving Jobs for Workspaces is one tap,
 * not a back gesture and then a tap.
 *
 * One of the five destinations in the bottom bar.
 */
export default function JobsScreen() {
  const { count: unseenJobs } = useUnseenJobs();
  const markSeen = useMarkJobsSeen();

  // Opening the board is what "seen" means. This used to happen on the top
  // bar's Jobs tab; the tab moved to the bottom bar, and without this the
  // badge would have counted up for ever with nothing able to clear it.
  useFocusEffect(
    useCallback(() => {
      if (unseenJobs > 0) markSeen.mutate();
      // Deliberately not depending on the mutation: it is recreated each
      // render, and depending on it would re-run this on every one.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [unseenJobs]),
  );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <AppTopBar />

      <View className="flex-row items-center justify-between px-5 py-3">
        <Text className="text-foreground text-2xl font-bold tracking-tight">Jobs</Text>
        <Pressable
          onPress={() => router.push('/jobs/new')}
          accessibilityRole="button"
          accessibilityLabel="Post a job"
          className="min-h-11 flex-row items-center gap-1.5 rounded-xl bg-action px-3.5 py-2 active:opacity-80"
        >
          <PlusIcon size={15} className="text-action-foreground" />
          <Text className="text-action-foreground text-[13px] font-bold">Post</Text>
        </Pressable>
      </View>

      {/* Clears the tab bar, which this screen keeps. */}
      <JobsTabs bottomPadding={120} />
    </SafeAreaView>
  );
}
