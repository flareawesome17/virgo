import { View, Text } from 'react-native';
import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import {
  lastSeenLabel,
  typingLabel,
  usePresence,
  useTypingIn,
} from '@/src/lib/presence-store';

/**
 * A dot on an avatar showing whether somebody is connected.
 *
 * Absolutely positioned, so the parent needs `relative`. The border is what
 * separates it from a photograph — a bare green circle on an avatar is
 * unreadable against a light shirt.
 */
export function PresenceDot({
  userId,
  size = 13,
  /** Should match the surface behind the avatar. */
  borderColor = '#161311',
}: {
  userId: string | null | undefined;
  size?: number;
  borderColor?: string;
}) {
  const { online } = usePresence(userId);
  if (!userId || !online) return null;

  return (
    <View
      style={{
        position: 'absolute',
        right: -1,
        bottom: -1,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: '#6B8E4E',
        borderWidth: 2,
        borderColor,
      }}
    />
  );
}

/** "Online" or "Last seen 20m ago", for a thread header. */
export function PresenceLine({
  userId,
  fallback = 'Tap for info',
}: {
  userId: string | null | undefined;
  fallback?: string;
}) {
  const { online, lastSeenAt } = usePresence(userId);
  if (!userId) return <Text className="text-muted-foreground text-xs">{fallback}</Text>;

  return (
    <Text
      className="text-xs"
      style={online ? { color: '#6B8E4E', fontWeight: '600' } : undefined}
    >
      {online ? (
        'Online'
      ) : (
        <Text className="text-muted-foreground text-xs">{lastSeenLabel(lastSeenAt)}</Text>
      )}
    </Text>
  );
}

/** One dot of the typing bubble, pulsing on its own offset. */
function Dot({ delay }: { delay: number }) {
  const value = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(value, {
          toValue: 1,
          duration: 400,
          easing: Easing.out(Easing.quad),
          // The native driver keeps this off the JS thread, so it does not
          // stutter while messages are rendering.
          useNativeDriver: true,
        }),
        Animated.timing(value, {
          toValue: 0,
          duration: 400,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.delay(600 - delay),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [delay, value]);

  return (
    <Animated.View
      style={{
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#948278',
        opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
        transform: [
          { translateY: value.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) },
        ],
      }}
    />
  );
}

/**
 * The three-dot bubble at the foot of a thread.
 *
 * Renders nothing when nobody is typing, so it takes no space in the common
 * case and the list does not shift as it appears.
 */
export function TypingIndicator({
  conversationId,
  meId,
}: {
  conversationId: string | null | undefined;
  meId?: string | null;
}) {
  const names = useTypingIn(conversationId, meId);
  if (names.length === 0) return null;

  return (
    <View className="flex-row items-center gap-2 px-5 py-2">
      <View className="flex-row items-center gap-1 bg-muted rounded-2xl px-3.5 py-2.5">
        <Dot delay={0} />
        <Dot delay={140} />
        <Dot delay={280} />
      </View>
      <Text className="text-muted-foreground text-xs" numberOfLines={1}>
        {typingLabel(names)}
      </Text>
    </View>
  );
}

/**
 * The conversation row's second line while somebody is typing.
 *
 * Returns null when nobody is, so the caller can fall back to the message
 * preview — showing both would make every row taller on a keystroke.
 */
export function TypingPreview({
  conversationId,
  meId,
  isGroup,
}: {
  conversationId: string;
  meId?: string | null;
  isGroup: boolean;
}) {
  const names = useTypingIn(conversationId, meId);
  if (names.length === 0) return null;

  return (
    <Text className="text-primary text-xs font-medium flex-1" numberOfLines={1}>
      {isGroup ? typingLabel(names) : 'typing…'}
    </Text>
  );
}
