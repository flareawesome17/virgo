import { Text, View } from 'react-native';
import { RemoteImage } from '@/components/RemoteImage';
import type { Conversation } from '@/src/api';
import { initialsOf } from './chat-words';

/**
 * Whether a chat is a workspace's team chat, which wears a rounded square
 * rather than a circle: it stands for a studio, not a person.
 */
export function isTeamChat(c: Pick<Conversation, 'origin'> | null | undefined): boolean {
  return c?.origin === 'workspace';
}

/**
 * A person's photograph, or their initial on a tint of the accent — the way
 * the chat list draws people — and a group's photo, or its initial.
 *
 * A group's photo is avatar-sized and always loads, like a profile picture,
 * on any connection. With none, the group's initial sits on a quieter tint
 * than a person's, so a group never passes for somebody.
 */
export function ChatAvatar({
  name,
  url,
  size = 40,
  group = false,
  square = false,
  initials = 1,
}: {
  name: string;
  url?: string | null;
  size?: number;
  group?: boolean;
  /** A team chat's rounded square. */
  square?: boolean;
  /** How many letters: one in lists, two on a profile card. */
  initials?: 1 | 2;
}) {
  const shape = {
    width: size,
    height: size,
    borderRadius: square ? Math.round(size * 0.28) : size / 2,
  };
  if (url) return <RemoteImage source={{ uri: url }} style={shape} />;
  const letters = initials === 2 ? initialsOf(name) : (name.trim().charAt(0) || '?').toUpperCase();
  return (
    <View
      className={`items-center justify-center ${group ? 'bg-muted' : 'bg-primary/10'}`}
      style={shape}
    >
      <Text
        allowFontScaling={false}
        className={`font-bold ${group ? 'text-secondary-foreground' : 'text-primary'}`}
        style={{ fontSize: Math.round(size * 0.38) }}
      >
        {letters}
      </Text>
    </View>
  );
}
