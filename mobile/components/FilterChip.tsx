import { Text } from 'react-native';
import { PressableScale } from '@/components/PressableScale';
import { useChrome } from '@/src/providers/ChromeProvider';

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
  // A filter can leave a list too short to scroll, which could not then bring
  // hidden bars back; so a change brings them back.
  const { reveal } = useChrome();
  return (
    <PressableScale
      onPress={() => {
        onPress();
        reveal();
      }}
      scaleTo={0.95}
      // 36pt to look at, 44pt to touch.
      hitSlop={{ top: 4, bottom: 4 }}
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
