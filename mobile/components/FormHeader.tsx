import { Pressable, Text, View } from 'react-native';
import { XIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { goBackOr } from '@/components/ScreenHeader';

cssInterop(XIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

/**
 * The header of a form that makes something: close on the left, what it is in
 * the middle, and — when the form has one — the word that finishes it on the
 * right.
 *
 * These forms open from the bottom, as modals: making something is a task you
 * finish or abandon, not a place you go further into. So they close with an
 * X rather than going back with an arrow. Each used to draw its own — an
 * arrow alone, an arrow in a card with a shadow, or an X — at three sizes.
 */
export function FormHeader({
  title,
  subtitle,
  onClose,
  action,
}: {
  title: string;
  subtitle?: string;
  /** Instead of simply leaving — for a form that asks first. */
  onClose?: () => void;
  action?: {
    label: string;
    onPress: () => void;
    disabled?: boolean;
    busy?: boolean;
  };
}) {
  return (
    <View className="min-h-12 flex-row items-center border-b border-border pl-1 pr-2">
      <Pressable
        onPress={onClose ?? (() => goBackOr())}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Close"
        className="w-11 h-11 items-center justify-center active:opacity-60"
      >
        <XIcon size={22} className="text-foreground" />
      </Pressable>
      <View className="flex-1 min-w-0 items-center px-2">
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          className="text-foreground text-[16px] font-bold"
        >
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} className="text-muted-foreground text-[12px]">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {action ? (
        <Pressable
          onPress={action.onPress}
          disabled={action.disabled || action.busy}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityState={{ busy: !!action.busy, disabled: !!action.disabled }}
          className="min-h-11 min-w-11 px-3 items-center justify-center"
          style={{ opacity: action.disabled || action.busy ? 0.4 : 1 }}
        >
          <Text className="text-primary text-[15px] font-bold">{action.label}</Text>
        </Pressable>
      ) : (
        // Keeps the title centred when there is nothing on the right.
        <View className="w-11" />
      )}
    </View>
  );
}
