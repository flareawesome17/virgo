import { Text, View } from 'react-native';
import { RemoteImage } from '@/components/RemoteImage';

/**
 * Somebody's picture beside what they said, or their initial until they have
 * one. One component for the thread, the box and the comment's menu, so the
 * three sizes of the same face cannot come to look like different people.
 */
export function CommentAvatar({
  name,
  url,
  size,
}: {
  name: string;
  url: string | null | undefined;
  size: 28 | 32 | 36;
}) {
  return (
    <View
      className="rounded-full overflow-hidden bg-primary/15 items-center justify-center"
      style={{ width: size, height: size }}
    >
      {url ? (
        <RemoteImage source={{ uri: url }} style={{ width: size, height: size }} />
      ) : (
        <Text className="text-primary text-[12px] leading-4 font-bold">
          {(name.trim().charAt(0) || '?').toUpperCase()}
        </Text>
      )}
    </View>
  );
}
