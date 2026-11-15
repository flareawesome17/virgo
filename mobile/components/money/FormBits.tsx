import { Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LucideIcon } from 'lucide-react-native';
import { PressableScale } from '@/components/PressableScale';
import { useKeyboardUp } from '@/src/lib/keyboard';
import { useWindowInsets } from '@/src/lib/window-insets';

/**
 * The edge every field in the money forms has: a hairline, as every other
 * form's fields have. It was a soft shadow, which is where the name comes
 * from; the colour is the muted ink at a quarter, so it holds in both themes.
 */
export const CARD_SHADOW = {
  borderWidth: 1,
  borderColor: 'rgba(123,103,93,0.25)',
} as const;

/** A field's caption, with "(optional)" when it is. */
export function Label({ children, optional }: { children: string; optional?: boolean }) {
  return (
    <Text className="text-foreground text-[15px] leading-5 font-semibold mb-2">
      {children}
      {optional ? <Text className="text-muted-foreground font-normal"> optional</Text> : null}
    </Text>
  );
}

/** A small choice in a wrapping row: a category, a way of paying. */
export function Choice({
  label,
  on,
  onPress,
  icon: Icon,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
  icon?: LucideIcon;
}) {
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.95}
      hitSlop={{ top: 4, bottom: 4 }}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      className={`h-10 flex-row items-center gap-1.5 rounded-full px-4 ${on ? 'bg-foreground' : 'bg-muted'}`}
    >
      {Icon ? <Icon size={15} className={on ? 'text-background' : 'text-foreground'} /> : null}
      <Text className={`text-[14px] font-semibold ${on ? 'text-background' : 'text-foreground'}`}>
        {label}
      </Text>
    </PressableScale>
  );
}

/**
 * A money form's Save, at the foot of the screen and in the layout's flow.
 *
 * It used to float over the scrolling fields, pinned to the bottom with a
 * fixed gap left under them. With the keyboard up, a taller navigation bar,
 * or larger text, the bar sat on top of the very field being typed in. In the
 * flow, the fields end where the bar begins, so nothing can hide behind it.
 *
 * While the keyboard is up it steps aside: the header's Save is still there,
 * and the whole height goes to the form. Its bottom inset is the window's on
 * iOS, as in InsetFrame — these forms are full-screen modals there.
 */
export function FormSaveBar({
  label,
  onPress,
  busy,
}: {
  label: string;
  onPress: () => void;
  busy: boolean;
}) {
  const keyboardUp = useKeyboardUp();
  const local = useSafeAreaInsets();
  const window = useWindowInsets();
  const bottom = Platform.OS === 'ios' ? window.bottom : local.bottom;
  if (keyboardUp) return null;
  return (
    <View className="px-5 pt-3 bg-background border-t border-border/50" style={{ paddingBottom: Math.max(bottom, 12) }}>
      <Pressable
        onPress={onPress}
        disabled={busy}
        accessibilityRole="button"
        className="h-[52px] rounded-[14px] items-center justify-center bg-action active:opacity-85"
        style={{ opacity: busy ? 0.6 : 1 }}
      >
        <Text className="text-action-foreground text-[16px] font-semibold">{label}</Text>
      </Pressable>
    </View>
  );
}
