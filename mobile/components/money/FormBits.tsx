import { Text } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { PressableScale } from '@/components/PressableScale';

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
