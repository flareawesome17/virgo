import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { Redirect, Stack } from 'expo-router';
import {
  useAuth,
  useMessageAlerts,
  useRealtime,
  useNotificationRouting,
  usePushRegistration,
  useReminderNotifications,
  useReminders,
} from '@/src/hooks';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

/**
 * Auth gate for every protected screen.
 *
 * Previously this was a bare <Stack>, so nothing stopped an unauthenticated
 * user from landing on the home screen, and signing out left them sitting on a
 * screen they no longer had access to.
 *
 * Three distinct states, deliberately kept apart:
 *   resolving  -> splash. Rendering children first would flash private UI.
 *   signed out -> redirect. <Redirect>, not router.replace(), because
 *                 navigating during render updates the navigation container
 *                 mid-render.
 *   unreachable-> retry. A dropped connection is NOT proof of being signed
 *                 out; bouncing to login there would log people out whenever
 *                 the network hiccups.
 */
export default function AppLayout() {
  const { isAuthenticated, isLoading, isSessionError, retrySession } = useAuth();

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color="#B66A40" />
      </View>
    );
  }

  if (isSessionError && !isAuthenticated) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-10">
        <Text className="text-foreground text-lg font-bold">Can’t reach the server</Text>
        <Text className="text-muted-foreground text-sm text-center mt-2">
          Check your connection and try again. You are still signed in.
        </Text>
        <Pressable
          onPress={() => retrySession()}
          className="mt-6 bg-primary rounded-2xl px-8 py-3.5 active:scale-[0.96]"
        >
          <Text className="text-white text-base font-bold">Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/welcome" />;
  }

  return (
    <>
      {/* Mounted here rather than on the schedule tab so alarms stay scheduled
          and messages announce themselves no matter which screen is showing. */}
      <NotificationServices />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}

/**
 * Keeps device alarms in sync, registers for server push, routes notification
 * taps, and buzzes for messages that arrive while the app is open.
 *
 * A component rather than hooks in AppLayout because it must only run once the
 * user is authenticated — AppLayout returns early in three other states, and
 * hooks cannot be called conditionally.
 */
function NotificationServices() {
  const { reminders } = useReminders({
    orderBy: 'reminder_time',
    direction: 'asc',
    limit: 100,
  });

  useReminderNotifications(reminders);
  usePushRegistration(true);
  useNotificationRouting(true);
  useMessageAlerts(true);
  useRealtime(true);

  return null;
}
