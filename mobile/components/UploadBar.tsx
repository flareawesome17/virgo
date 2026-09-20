import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  SafeAreaInsetsContext,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { UploadCloudIcon, AlertCircleIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { useUploadQueue } from '@/src/providers/UploadProvider';

for (const Icon of [UploadCloudIcon, AlertCircleIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/**
 * What an upload looks like from anywhere in the app.
 *
 * Wraps the navigator rather than sitting inside AppTopBar, which is where it
 * started and where it was useless: that bar renders on the six tab screens
 * only, and nobody uploads from a tab. Every route in is an album or a
 * workspace, and `router.back()` after handing the files over returns you to
 * one of those — so the upload ran with no indicator anywhere, which is what
 * it was built to prevent.
 *
 * Wrapping is also what makes the inset correct. When the bar shows it covers
 * the notch, and the screens underneath must not pad for it again: nearly all
 * of them open with `SafeAreaView edges={['top']}`, which reads from this
 * context, so overriding `top` to 0 is what stops a second gap appearing.
 * VerifyEmailBanner does the same thing directly above this, and the two nest
 * correctly — whichever is outermost takes the notch and zeroes it for the
 * rest.
 *
 * Renders its children untouched when there is nothing to say. Failures stay
 * after the queue drains, because a file that did not upload is the one thing
 * here worth interrupting someone for; successes disappear on their own.
 */
export function UploadBar({ children }: { children: ReactNode }) {
  const { tasks, active, overall, remaining } = useUploadQueue();
  const insets = useSafeAreaInsets();

  const failed = tasks.filter((task) => task.status === 'failed').length;
  if (!active && failed === 0) return <>{children}</>;

  const percent = Math.round(overall * 100);

  return (
    <>
    <Pressable
      onPress={() => router.push('/albums/upload')}
      accessibilityRole="button"
      accessibilityLabel={
        active
          ? `Uploading, ${percent} percent, ${remaining} remaining`
          : `${failed} ${failed === 1 ? 'upload' : 'uploads'} failed`
      }
      className="border-b border-border/40 bg-card px-4 pb-2"
      // The notch, once. The screens below get it zeroed, just under here.
      style={{ paddingTop: insets.top + 8 }}
    >
      <View className="flex-row items-center gap-2.5">
        {active ? (
          <UploadCloudIcon size={15} className="text-primary" />
        ) : (
          <AlertCircleIcon size={15} className="text-destructive" />
        )}
        <Text className="text-foreground flex-1 text-[12px] font-semibold" numberOfLines={1}>
          {active
            ? `Uploading ${remaining} ${remaining === 1 ? 'file' : 'files'}`
            : `${failed} ${failed === 1 ? 'upload' : 'uploads'} did not finish`}
        </Text>
        {active && (
          <Text className="text-muted-foreground text-[12px] font-semibold tabular-nums">
            {percent}%
          </Text>
        )}
      </View>

      {active && (
        // Track and fill rather than a spinner: a spinner says "busy" and this
        // has a real number behind it, which is the difference between waiting
        // and knowing how long.
        <View className="bg-muted mt-1.5 h-1 overflow-hidden rounded-full">
          <View
            className="bg-primary h-full rounded-full"
            style={{ width: `${Math.min(percent, 100)}%` }}
          />
        </View>
      )}
    </Pressable>

    <SafeAreaInsetsContext.Provider value={{ ...insets, top: 0 }}>
      {children}
    </SafeAreaInsetsContext.Provider>
    </>
  );
}
