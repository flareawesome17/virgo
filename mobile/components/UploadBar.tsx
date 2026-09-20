import { Pressable, Text, View } from 'react-native';
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
 * Uploads used to be visible only on the screen that started them, because
 * that screen owned them. Now the queue outlives it, and this is the part that
 * says so — without it an upload would carry on invisibly, which is worse than
 * the screen holding you hostage.
 *
 * Renders nothing when there is nothing to say. Failures stay after the queue
 * drains, because a file that did not upload is the one thing here worth
 * interrupting someone for; successes disappear on their own.
 */
export function UploadBar() {
  const { tasks, active, overall, remaining } = useUploadQueue();

  const failed = tasks.filter((task) => task.status === 'failed').length;
  if (!active && failed === 0) return null;

  const percent = Math.round(overall * 100);

  return (
    <Pressable
      onPress={() => router.push('/albums/upload')}
      accessibilityRole="button"
      accessibilityLabel={
        active
          ? `Uploading, ${percent} percent, ${remaining} remaining`
          : `${failed} ${failed === 1 ? 'upload' : 'uploads'} failed`
      }
      className="border-b border-border/40 bg-card px-4 py-2 active:opacity-80"
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
  );
}
