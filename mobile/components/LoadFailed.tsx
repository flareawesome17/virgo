import { View, Text, Pressable } from 'react-native';
import { CloudOffIcon, RotateCwIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';

cssInterop(CloudOffIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(RotateCwIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

/**
 * A list that could not load, said plainly.
 *
 * Every list on the phone used to fall through to its empty state when the
 * query failed, so a dropped connection or an expired session read as "No open
 * jobs right now" — a confident statement about the world, made from a failed
 * request. That is worse than an error: the reader believes it and stops
 * looking.
 *
 * It matters more since reads started requiring an account. A 401 now has the
 * same shape as a quiet weekend on the job board, and only one of those is
 * worth telling somebody about.
 */
export function LoadFailed({
  what,
  onRetry,
  compact = false,
}: {
  /** What failed, in a noun phrase: "the job board", "your applications". */
  what: string;
  onRetry: () => void;
  /** For inline use inside a card, where a full-height block would be odd. */
  compact?: boolean;
}) {
  return (
    <View className={`items-center px-10 ${compact ? 'py-6' : 'flex-1 justify-center'}`}>
      <CloudOffIcon size={compact ? 22 : 30} className="text-muted-foreground" />
      <Text className="text-foreground text-[15px] font-bold mt-3 text-center">
        Could not load {what}
      </Text>
      <Text className="text-muted-foreground text-[13px] text-center mt-1.5 leading-5">
        Check your connection and try again.
      </Text>
      <Pressable
        className="mt-4 rounded-xl px-5 py-2.5 flex-row items-center gap-2 border border-primary"
        onPress={onRetry}
        accessibilityRole="button"
      >
        <RotateCwIcon size={14} className="text-primary" />
        <Text className="text-primary text-[13px] font-bold">
          Try again
        </Text>
      </Pressable>
    </View>
  );
}
