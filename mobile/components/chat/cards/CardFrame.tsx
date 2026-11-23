import type { ReactNode, Ref } from 'react';
import { Pressable, Text, View, useWindowDimensions, type AccessibilityActionEvent } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';

/** How wide a card on someone's side is, as on the boards; never past 80% of the thread. */
export const CARD_WIDTH = 280;

/**
 * The thread's own long-press, offered to a screen reader on whatever part
 * of a card reads it out.
 */
export function holdActions(onHold: () => void) {
  return {
    accessibilityActions: [{ name: 'longpress', label: 'Message actions' }],
    onAccessibilityAction: (e: AccessibilityActionEvent) => {
      if (e.nativeEvent.actionName === 'longpress') onHold();
    },
  };
}

/**
 * Where a shared card sits: on its sender's side like their own line, with
 * the sender's name over it in a group, its reactions under it, and when it
 * was sent. Yours has the accent's edge, as a pay card does; theirs a
 * hairline, like their bubbles. A centred card (a booking) is nobody's side
 * and fills the width, as the job-accepted card does.
 *
 * With `onPress` the whole card is the button and reads as one thing. Without
 * it, the card's own buttons are reachable one by one, and the card's words
 * go on whatever the card marks with `holdActions`.
 */
export function CardFrame({
  ref,
  mine,
  centred = false,
  senderName,
  meta,
  width = CARD_WIDTH,
  padded = true,
  onPress,
  onHold,
  label,
  hint,
  pills,
  children,
}: {
  /** What the thread measures to lift it in place. */
  ref?: Ref<View>;
  mine: boolean;
  centred?: boolean;
  /** Over the card, in a group, for the first of a run from one person. */
  senderName?: string | null;
  /** Under it: when, and for yours how far it has got. */
  meta: string;
  width?: number;
  /** False for a card whose pictures run to its edges. */
  padded?: boolean;
  onPress?: () => void;
  onHold: () => void;
  /** With `onPress`: what a screen reader says for the whole card. */
  label?: string;
  hint?: string;
  pills: ReactNode;
  children: ReactNode;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const side = Math.min(width, Math.floor((windowWidth - 32) * 0.8));
  const whole = !!onPress;

  return (
    <View className={centred ? 'items-stretch' : mine ? 'items-end' : 'items-start'}>
      {senderName && !centred ? (
        <Text className="text-muted-foreground text-xs mb-0.5 ml-1" numberOfLines={1}>
          {senderName}
        </Text>
      ) : null}
      <Pressable
        ref={ref}
        onPress={onPress}
        onLongPress={onHold}
        delayLongPress={300}
        accessible={whole}
        accessibilityRole={whole ? 'button' : undefined}
        accessibilityLabel={whole ? `${label ?? ''}, ${meta}` : undefined}
        accessibilityHint={whole ? hint : undefined}
        {...(whole ? holdActions(onHold) : {})}
        className={`bg-card overflow-hidden ${whole ? 'active:opacity-90' : ''} ${
          centred ? 'my-1.5 border border-border/40' : mine ? 'border-[1.5px] border-action' : 'border border-border/40'
        } ${padded ? (centred ? 'p-4' : 'px-3.5 pt-3 pb-3.5') : ''}`}
        style={
          centred
            ? { borderRadius: 20 }
            : {
                width: side,
                borderRadius: 20,
                borderBottomRightRadius: mine ? 6 : 20,
                borderBottomLeftRadius: mine ? 20 : 6,
              }
        }
      >
        {children}
      </Pressable>
      {pills}
      <Text
        className={`text-muted-foreground text-[11px] mt-1 mx-1 ${centred ? 'text-center' : ''}`}
        importantForAccessibility="no"
        accessibilityElementsHidden
      >
        {meta}
      </Text>
    </View>
  );
}

/** The small grey line that says what kind of card it is: an icon and a word. */
export function CardKindLabel({
  icon: Icon,
  label,
  right,
}: {
  /** Registered with cssInterop by CARD_ICON. */
  icon: LucideIcon;
  label: string;
  /** On the right: a status word. */
  right?: ReactNode;
}) {
  return (
    <View className="flex-row items-center gap-1.5">
      <Icon size={14} className="text-muted-foreground" />
      <Text className="flex-1 text-muted-foreground text-[12px] leading-4 font-bold" numberOfLines={1}>
        {label}
      </Text>
      {right}
    </View>
  );
}

/** A quiet button across a card: "View job", "Open booking". */
export function CardButton({
  label,
  onPress,
  onHold,
  disabled,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  onHold: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onHold}
      delayLongPress={300}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      className="mt-2.5 h-10 rounded-xl bg-muted items-center justify-center active:opacity-70"
    >
      <Text className="text-foreground text-[14px] font-semibold">{label}</Text>
    </Pressable>
  );
}

/** What a card says when the thing it shows is gone, or no longer its sender's to show. */
export function CardGone({ words }: { words: string }) {
  return <Text className="text-muted-foreground text-[14px] leading-5 italic">{words}</Text>;
}
