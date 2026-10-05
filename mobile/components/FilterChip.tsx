import { Text } from 'react-native';
import { PressableScale } from '@/components/PressableScale';

/**
 * One choice in a row of filters: a role, a status, whose workspaces.
 *
 * The rows had three looks — copper outlines on the jobs board, dark pills on
 * workspaces and albums — for the same idea. This is the dark pill, which is
 * the one that reads as "narrowing" rather than "going somewhere", and which
 * SegmentedTabs, for switching views, does not look like.
 */
export function FilterChip({
  label,
  on,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.95}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={accessibilityLabel ?? label}
      className={`h-9 rounded-full px-4 justify-center ${
        on ? 'bg-foreground' : 'bg-card border border-border'
      }`}
    >
      <Text
        numberOfLines={1}
        className={`text-[13px] ${on ? 'text-background font-bold' : 'text-foreground font-medium'}`}
      >
        {label}
      </Text>
    </PressableScale>
  );
}
