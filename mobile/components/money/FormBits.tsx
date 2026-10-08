import { Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LucideIcon } from 'lucide-react-native';
import { PressableScale } from '@/components/PressableScale';
import { useKeyboardUp } from '@/src/lib/keyboard';
import { useWindowInsets } from '@/src/lib/window-insets';

/** The soft lift every field card in the money forms has. */
export const CARD_SHADOW = {
  shadowColor: '#000',
  shadowOpacity: 0.03,
  shadowRadius: 6,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
} as const;

/** A field's caption, with "(optional)" when it is. */
export function Label({ children, optional }: { children: string; optional?: boolean }) {
  return (
    <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">
      {children}
      {optional ? (
        <Text className="font-medium normal-case tracking-normal"> (optional)</Text>
      ) : null}
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
      className={`h-10 flex-row items-center gap-1.5 rounded-full px-3.5 ${
        on ? 'bg-foreground' : 'bg-card border border-border'
      }`}
    >
      {Icon ? <Icon size={15} className={on ? 'text-background' : 'text-muted-foreground'} /> : null}
      <Text className={`text-[13px] ${on ? 'text-background font-bold' : 'text-foreground font-medium'}`}>
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
    <View className="px-5 pt-3 bg-background border-t border-border/40" style={{ paddingBottom: bottom + 16 }}>
      <Pressable
        onPress={onPress}
        disabled={busy}
        accessibilityRole="button"
        className="rounded-2xl py-3.5 items-center bg-action active:scale-[0.97]"
        style={{ opacity: busy ? 0.6 : 1 }}
      >
        <Text className="text-white text-base font-bold">{label}</Text>
      </Pressable>
    </View>
  );
}
