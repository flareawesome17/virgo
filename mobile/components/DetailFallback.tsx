import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError } from '@/src/api';
import { LoadFailed } from '@/components/LoadFailed';
import { ScreenHeader } from '@/components/ScreenHeader';

/**
 * What a detail screen shows before it has its record: loading, gone, or out
 * of reach — each with a header and a way back.
 *
 * These screens used to render "Loading..." until the record arrived, which it
 * never did for a deleted event, a withdrawn invitation, a stale notification
 * or a phone with no signal. Their back button lived in the part that was
 * never drawn, so there was no way out either.
 */
export function DetailFallback({
  title,
  what,
  gone,
  error,
  failed,
  onRetry,
}: {
  /** The header title, as the loaded screen would name it. */
  title: string;
  /** For the retry state, as a noun phrase: "this event". */
  what: string;
  /** Why it might not be there, for the 404 state. */
  gone: string;
  error: unknown;
  /** True when the query failed or is paused offline. */
  failed: boolean;
  onRetry: () => void;
}) {
  // The API answers "not yours" and "not there" alike, deliberately, so ids
  // cannot be probed; to the reader both mean the same thing.
  const missing =
    error instanceof ApiError && (error.status === 404 || error.status === 403);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <ScreenHeader title={title} />
      {missing ? (
        <View className="flex-1 items-center justify-center px-10">
          <Text className="text-foreground text-[15px] font-bold text-center">
            This is no longer available
          </Text>
          <Text className="text-muted-foreground text-[13px] text-center mt-1.5 leading-5">
            {gone}
          </Text>
        </View>
      ) : failed ? (
        <LoadFailed what={what} onRetry={onRetry} />
      ) : (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#B66A40" />
        </View>
      )}
    </SafeAreaView>
  );
}
