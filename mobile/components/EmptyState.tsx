import { Pressable, Text, View } from 'react-native';
import { cssInterop } from 'nativewind';
import type { LucideIcon } from 'lucide-react-native';
import { PressableScale } from '@/components/PressableScale';
import { useRevealOnMount } from '@/src/providers/ChromeProvider';

/**
 * The icons arrive from the caller, so they are registered here — once each,
 * as the app's rule asks, and not again on every render.
 */
const registered = new WeakSet<LucideIcon>();
function withColour(Icon: LucideIcon): LucideIcon {
  if (!registered.has(Icon)) {
    cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
    registered.add(Icon);
  }
  return Icon;
}

/**
 * What a screen says when there is nothing in it yet.
 *
 * One look for all of them. They had grown five: icons in tinted circles of
 * three sizes or in no circle at all, titles from 15 to 18 points, and
 * buttons in the action colour, in a hard-coded copper, and with icons or
 * without. What stays is what each one is for — saying what will be here, and
 * the one way to make the first of it.
 *
 * Not for a failed load: that is LoadFailed, which says so and offers a retry.
 * "Nothing here" on a failure tells somebody their work is gone.
 */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  secondary,
}: {
  icon: LucideIcon;
  title: string;
  body?: string;
  /** The one way forward, if there is one. */
  action?: { label: string; onPress: () => void; icon?: LucideIcon };
  /** A quieter second way, as a text link. */
  secondary?: { label: string; onPress: () => void };
}) {
  // Nothing here scrolls, so it is the one place hidden bars can come back.
  useRevealOnMount();
  withColour(Icon);
  const ActionIcon = action?.icon ? withColour(action.icon) : undefined;

  return (
    <View className="items-center px-10 py-12">
      <View className="w-16 h-16 rounded-full bg-primary/10 items-center justify-center">
        <Icon size={26} className="text-primary" />
      </View>
      <Text accessibilityRole="header" className="text-foreground text-[17px] font-bold text-center mt-4">
        {title}
      </Text>
      {body ? (
        <Text className="text-muted-foreground text-[14px] leading-5 text-center mt-1.5">{body}</Text>
      ) : null}
      {action ? (
        <PressableScale
          onPress={action.onPress}
          accessibilityRole="button"
          style={{ marginTop: 24 }}
          className="min-h-11 flex-row items-center justify-center gap-2 rounded-xl bg-action px-6"
        >
          {ActionIcon ? <ActionIcon size={16} className="text-action-foreground" /> : null}
          <Text className="text-action-foreground text-[14px] font-bold">{action.label}</Text>
        </PressableScale>
      ) : null}
      {secondary ? (
        <Pressable
          onPress={secondary.onPress}
          accessibilityRole="button"
          hitSlop={8}
          className="mt-3 min-h-11 justify-center active:opacity-60"
        >
          <Text className="text-primary text-[14px] font-semibold">{secondary.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
