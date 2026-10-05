import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import type { LucideIcon } from 'lucide-react-native';

/** The lozenge's glide between segments: Material's standard curve. */
const GLIDE = { duration: 220, easing: Easing.bezier(0.2, 0, 0, 1) };
const PADDING = 4;

export interface Segment<K extends string> {
  key: K;
  label: string;
  icon?: LucideIcon;
  /** A count of things waiting, drawn as a pill. */
  badge?: number;
  /** Something waiting with no count worth giving. */
  dot?: boolean;
  /** Read out instead of the label, when the label alone says too little. */
  accessibilityLabel?: string;
}

/**
 * The one control for switching what a screen shows.
 *
 * There were four, all doing this: filled pills on the Feed, uppercase
 * underlined tabs on Jobs, dark pills on Workspaces, and a segmented control
 * on Connect and Settings — plus two more variants inside workspaces and
 * profiles. This is the segmented control, everywhere: equal segments, one
 * tap each, and a lozenge that glides to the one chosen, on the UI thread.
 *
 * For switching views only. Narrowing a list — by role, by status — is
 * FilterChip's job; a filter can have nothing chosen, and a view cannot.
 */
export function SegmentedTabs<K extends string>({
  segments,
  value,
  onChange,
  size = 'md',
}: {
  // Inside JSX the keys widen to string unless the call names its type:
  // `<SegmentedTabs<typeof tab> …>`.
  segments: Segment<K>[];
  value: K;
  onChange: (key: K) => void;
  /** `sm` for a control inside a card or a header row. */
  size?: 'md' | 'sm';
}) {
  const index = Math.max(0, segments.findIndex((s) => s.key === value));
  const [width, setWidth] = useState(0);
  const segmentWidth = width > 0 ? (width - PADDING * 2) / segments.length : 0;

  const offset = useSharedValue(0);
  const placed = useRef(false);
  useEffect(() => {
    if (segmentWidth <= 0) return;
    const to = index * segmentWidth;
    // Straight to its place the first time it can be measured; after that it
    // glides there.
    if (!placed.current) {
      offset.value = to;
      placed.current = true;
    } else {
      offset.value = withTiming(to, GLIDE);
    }
  }, [index, segmentWidth, offset]);

  const lozenge = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));

  const onLayout = (event: LayoutChangeEvent) => {
    const measured = event.nativeEvent.layout.width;
    if (measured > 0 && measured !== width) setWidth(measured);
  };

  const height = size === 'sm' ? 'min-h-9' : 'min-h-11';

  return (
    <View
      accessibilityRole="tablist"
      onLayout={onLayout}
      className="flex-row rounded-xl bg-secondary"
      style={{ padding: PADDING }}
    >
      {segmentWidth > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              top: PADDING,
              bottom: PADDING,
              left: PADDING,
              width: segmentWidth,
            },
            lozenge,
          ]}
        >
          {/* The colour lives on a plain View: NativeWind does not reach
              Reanimated's components. */}
          <View className="flex-1 rounded-lg bg-card border border-border/40" />
        </Animated.View>
      )}
      {segments.map((segment) => {
        const on = segment.key === value;
        const Icon = segment.icon;
        const badge = segment.badge ?? 0;
        return (
          <Pressable
            key={segment.key}
            onPress={() => {
              if (!on) onChange(segment.key);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={
              (segment.accessibilityLabel ?? segment.label) +
              (badge > 0 ? `, ${badge} waiting` : segment.dot ? ', something waiting' : '')
            }
            className={`flex-1 ${height} flex-row items-center justify-center gap-1.5 px-2 active:opacity-70`}
          >
            {Icon ? (
              <Icon size={16} className={on ? 'text-primary' : 'text-muted-foreground'} />
            ) : null}
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
              className={`${size === 'sm' ? 'text-[12px]' : 'text-[13px]'} font-semibold ${
                on ? 'text-foreground' : 'text-muted-foreground'
              }`}
            >
              {segment.label}
            </Text>
            {badge > 0 ? (
              <View className="min-w-[18px] h-[18px] items-center justify-center rounded-full bg-action px-1">
                <Text allowFontScaling={false} className="text-action-foreground text-[10px] font-bold">
                  {badge > 99 ? '99+' : badge}
                </Text>
              </View>
            ) : segment.dot ? (
              <View className="w-1.5 h-1.5 rounded-full bg-primary" />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
