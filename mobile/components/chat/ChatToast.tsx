import { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';

/** Long enough to read twice. */
const TOAST_MS = 3200;

/**
 * A brief word over the foot of the screen — "Forwarded to 2 chats" — in the
 * same dark bar as "Kept to …", which is what the app says things with.
 *
 * `bottom` is how far above the screen's bottom edge it sits: over the
 * composer in a thread, over the tab bar in the list.
 */
export function useChatToast(bottom: number) {
  const [text, setText] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const show = useCallback((next: string) => {
    clearTimeout(timer.current);
    setText(next);
    timer.current = setTimeout(() => setText(null), TOAST_MS);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  const element = text ? (
    <Animated.View
      entering={FadeInDown.duration(180)}
      exiting={FadeOutDown.duration(140)}
      pointerEvents="none"
      style={{ position: 'absolute', left: 16, right: 16, bottom }}
      accessibilityLiveRegion="polite"
    >
      <View
        className="rounded-2xl bg-foreground px-4 min-h-[48px] justify-center"
        style={{
          shadowColor: '#000',
          shadowOpacity: 0.25,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 8 },
          elevation: 6,
        }}
      >
        <Text className="text-background text-[15px] leading-5 py-3" numberOfLines={2}>
          {text}
        </Text>
      </View>
    </Animated.View>
  ) : null;

  return { show, element };
}
