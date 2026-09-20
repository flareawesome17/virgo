import { Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

/**
 * How full the account is, as a ring.
 *
 * SVG rather than a charting library: this is two circles and an arc, and
 * react-native-svg is already here for the ones that are not.
 */
export function StorageRing({
  fraction,
  color,
  trackColor,
  size = 96,
  stroke = 11,
}: {
  /** 0–1. Anything above 1 is clamped; an unlimited plan passes 0. */
  fraction: number;
  color: string;
  trackColor: string;
  size?: number;
  stroke?: number;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(fraction, 1));

  /*
   * A true arc for a nearly empty account is a few pixels of stroke hidden
   * under the round cap — the ring reads as broken rather than as empty. Any
   * account with something in it therefore draws at least this much, and the
   * exact figure stays in the middle where it cannot mislead.
   */
  const MINIMUM = circumference * 0.012;
  const filled = clamped === 0 ? 0 : Math.max(MINIMUM, clamped * circumference);

  // 0.03% is worth showing as 0.03%, not as a rounded 0%.
  const percent = clamped * 100;
  const label =
    percent > 0 && percent < 1
      ? `${percent.toFixed(2)}%`
      : `${Math.round(percent)}%`;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={stroke}
          fill="none"
        />
        {filled > 0 && (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${circumference - filled}`}
            // Start at the top rather than at three o'clock.
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </Svg>
      <View className="absolute inset-0 items-center justify-center">
        <Text className="text-foreground text-[17px] font-bold tracking-tight">
          {label}
        </Text>
        <Text className="text-muted-foreground text-[9px] font-semibold uppercase tracking-wider">
          used
        </Text>
      </View>
    </View>
  );
}
