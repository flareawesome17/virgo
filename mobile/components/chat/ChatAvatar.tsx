import { Text, View } from 'react-native';
import { UsersIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { RemoteImage } from '@/components/RemoteImage';
import { initialsOf } from './chat-words';

cssInterop(UsersIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

/**
 * A person's photograph, or their initial on a tint of the accent — the way
 * the chat list draws people — and a group's people icon.
 */
export function ChatAvatar({
  name,
  url,
  size = 40,
  group = false,
  initials = 1,
}: {
  name: string;
  url?: string | null;
  size?: number;
  group?: boolean;
  /** How many letters: one in lists, two on a profile card. */
  initials?: 1 | 2;
}) {
  const round = { width: size, height: size, borderRadius: size / 2 };
  if (group) {
    return (
      <View className="bg-muted items-center justify-center" style={round}>
        <UsersIcon size={Math.round(size * 0.42)} className="text-secondary-foreground" />
      </View>
    );
  }
  if (url) return <RemoteImage source={{ uri: url }} style={round} />;
  const letters = initials === 2 ? initialsOf(name) : (name.trim().charAt(0) || '?').toUpperCase();
  return (
    <View className="bg-primary/10 items-center justify-center" style={round}>
      <Text
        allowFontScaling={false}
        className="text-primary font-bold"
        style={{ fontSize: Math.round(size * 0.38) }}
      >
        {letters}
      </Text>
    </View>
  );
}
