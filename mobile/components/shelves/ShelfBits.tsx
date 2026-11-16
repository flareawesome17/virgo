import { Pressable, Text, View } from 'react-native';
import { CheckIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';

cssInterop(CheckIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

/**
 * The mark at the end of a row that is one choice among several: a ring, and
 * dark with a tick once chosen. Dark, not terracotta — terracotta is for the
 * button that acts on the choice.
 */
export function Radio({ on }: { on: boolean }) {
  return on ? (
    <View className="w-[22px] h-[22px] rounded-full bg-foreground items-center justify-center">
      <CheckIcon size={13} strokeWidth={3} className="text-background" />
    </View>
  ) : (
    <View className="w-[22px] h-[22px] rounded-full border-2 border-muted-foreground/40" />
  );
}

/**
 * One of the buttons across the foot of a sheet: 52 high, filled for the thing
 * the sheet is for and quiet for the other way out.
 */
export function SheetButton({
  label,
  onPress,
  filled,
  disabled,
  busy,
  accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  filled?: boolean;
  disabled?: boolean;
  busy?: boolean;
  accessibilityHint?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      accessibilityHint={accessibilityHint}
      className={`flex-1 h-[52px] rounded-[14px] items-center justify-center px-3 ${
        filled ? 'bg-action active:opacity-85' : 'bg-muted active:opacity-70'
      }`}
      style={{ opacity: disabled ? 0.5 : 1 }}
    >
      <Text
        className={`text-[16px] font-semibold ${filled ? 'text-action-foreground' : 'text-foreground'}`}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}
