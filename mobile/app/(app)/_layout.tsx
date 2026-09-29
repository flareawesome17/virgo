import { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { Redirect, Stack, router, type ErrorBoundaryProps } from 'expo-router';
import {
  useAuth,
  useMessageAlerts,
  useRealtime,
  useNotificationRouting,
  usePushRegistration,
  useReminderNotifications,
  useReminders,
} from '@/src/hooks';
import {
  RolesRequiredSheet,
  UploadBar,
  VerifyEmailBanner,
  VideoSurface,
} from '@/components';
import { CrashScreen } from '@/components/CrashScreen';
import { AlbumAudioProvider } from '@/src/providers/AlbumAudioProvider';
import { VideoPlayerProvider } from '@/src/providers/VideoPlayerProvider';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

/**
 * Any signed-in screen that fails to draw lands here instead of closing the app.
 *
 * "Go to start" navigates first and retries second: this replaces the layout
 * but not the route, so a retry alone would draw the screen that just failed.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <CrashScreen
      error={error}
      onRetry={() => void retry()}
      onHome={() => {
        router.replace('/(app)/(tabs)');
        void retry();
      }}
    />
  );
}

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
  const {
    isAuthenticated,
    isLoading,
    isSessionError,
    isCheckingSession,
    retrySession,
    signOut,
  } = useAuth();

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color="#B66A40" />
      </View>
    );
  }

  if (isSessionError && !isAuthenticated) {
    // Retry used to give no sign it had been pressed: the request failed again
    // in a moment and the screen looked exactly as before. And there was no
    // way off this screen at all — someone who wanted a different account, or
    // whose server really was gone for good, could only uninstall.
    const busy = isCheckingSession || signOut.isPending;
    return (
      <View className="flex-1 items-center justify-center bg-background px-10">
        <Text className="text-foreground text-lg font-bold">Can’t reach the server</Text>
        <Text className="text-muted-foreground text-sm text-center mt-2">
          Check your connection and try again. You are still signed in.
        </Text>
        <Pressable
          onPress={() => retrySession()}
          disabled={busy}
          accessibilityRole="button"
          accessibilityState={{ busy: isCheckingSession, disabled: busy }}
          className="mt-6 min-w-[140px] items-center bg-action rounded-2xl px-8 py-3.5 active:scale-[0.96]"
          style={{ opacity: signOut.isPending ? 0.5 : 1 }}
        >
          {isCheckingSession ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text className="text-white text-base font-bold">Retry</Text>
          )}
        </Pressable>
        <Pressable
          onPress={() => signOut.mutate()}
          disabled={busy}
          accessibilityRole="button"
          hitSlop={8}
          className="mt-4 px-4 py-2"
        >
          <Text className="text-muted-foreground text-sm font-semibold">
            {signOut.isPending ? 'Signing out…' : 'Sign out'}
          </Text>
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
      {/* Here rather than on a settings screen, so an account with no roles is
          asked wherever it lands rather than only if it goes looking. */}
      <RolesRequiredSheet />
      {/* Wraps the Stack rather than sitting beside it: when the banner shows
          it takes the top safe area, and it zeroes that inset for the screens
          underneath so they do not pad for the notch a second time. Renders
          its children untouched once the address is confirmed. */}
      <VideoPlayerProvider>
      <AlbumAudioProvider>
        <VerifyEmailBanner>
          {/* Wraps the navigator, not AppTopBar, which renders on the six tab
              screens only — and nobody uploads from a tab. Every route into
              the upload screen is an album or a workspace, so this is the one
              placement where the indicator is on screen while it runs. */}
          <UploadBar>
            {/* Inside UploadBar so the docked film sits below the upload
                strip rather than fighting it for the same edge, and around
                the navigator so a film survives going back to the album. */}
            <VideoSurface>
              <Stack screenOptions={{ headerShown: false }} />
            </VideoSurface>
          </UploadBar>
        </VerifyEmailBanner>
      </AlbumAudioProvider>
      </VideoPlayerProvider>
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
  const { user } = useAuth();
  // Upcoming and not done, soonest first. This was the 100 oldest, completed
  // and long past included, so from a busy account's hundredth reminder on the
  // new ones were never scheduled. Fixed at mount so the query key is stable;
  // anything that falls due during the session is skipped by the scheduler.
  const [dueFrom] = useState(() => new Date(Date.now() - 60_000).toISOString());
  const upcoming = useReminders({
    is_completed: false,
    due_from: dueFrom,
    orderBy: 'reminder_time',
    direction: 'asc',
    limit: 100,
  });
  const list = upcoming.reminders;

  useReminderNotifications(list, {
    ready: upcoming.isSuccess,
    // More exist than came back: nothing past the last one is known here.
    listThrough: upcoming.total > list.length ? (list[list.length - 1]?.reminder_time ?? null) : null,
  });
  usePushRegistration(user?.id ?? null);
  useNotificationRouting(true);
  useMessageAlerts(true);
  useRealtime(true);

  return null;
}
