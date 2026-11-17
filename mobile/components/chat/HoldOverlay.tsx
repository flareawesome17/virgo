import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal, Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useShade } from '@/components/BottomSheet';
import { useWindowInsets } from '@/src/lib/window-insets';

/** Where something held sits on screen, from measureInWindow. */
export interface HeldRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const MENU_ROW = 48;
export const MENU_ROW_TALL = 56;
/** The thicker rule above a destructive row. */
export const MENU_BREAK = 6;
/** Between the held thing and what sits above and below it. */
export const HOLD_GAP = 10;

/**
 * Where the held stack goes: as close to the original as fits, and never
 * under the status bar or the home indicator.
 *
 * `above` is what sits over the held copy (the reactions), `below` what sits
 * under it (the menu). The copy itself is cut to fit when the message is
 * taller than the screen allows, and `copyHeight` says how tall it may be.
 */
export function useHoldPlacement(
  rect: HeldRect | null,
  above: number,
  below: number,
): { top: number; copyHeight: number } {
  const { height: windowHeight } = useWindowDimensions();
  const insets = useWindowInsets();
  const minTop = insets.top + 12;
  const maxBottom = windowHeight - insets.bottom - 12;
  const room = maxBottom - minTop - above - below;
  const copyHeight = Math.max(44, Math.min(rect?.height ?? 0, room));
  const total = above + copyHeight + below;
  const wanted = (rect?.y ?? minTop) - above;
  const top = Math.max(minTop, Math.min(wanted, maxBottom - total));
  return { top, copyHeight };
}

/**
 * The dimmed screen something held lifts out of: a message with its
 * reactions and menu, a chat row with its menu.
 *
 * A Modal, faded, like the app's sheets. It goes on showing what it showed
 * last while it fades, and `onClosed` comes once it has fully gone — the
 * moment another sheet or an alert can follow, since iOS will not present
 * one over a modal that is still leaving.
 */
/** How long the Modal's fade-out holds the screen on Android and the web. */
const FADE_OUT_MS = 320;

export function HoldOverlay({
  visible,
  onClose,
  onClosed,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  onClosed?: () => void;
  children: ReactNode;
}) {
  const shade = useShade();
  const [lastShown, setLastShown] = useState(children);
  if (visible && lastShown !== children) setLastShown(children);

  const latest = useRef(onClosed);
  latest.current = onClosed;
  const wasVisible = useRef(visible);
  // iOS says the overlay is gone from onDismiss below. Android and the web have
  // no such signal, and the fade-out keeps the overlay's window on top for a
  // moment: an action run straight away, like Edit focusing the message box,
  // lost its focus to the closing overlay and the keyboard never came up. So
  // wait out the fade (RN's is about 300 ms) before running it.
  useEffect(() => {
    const goneNow = wasVisible.current && !visible;
    wasVisible.current = visible;
    if (!goneNow || Platform.OS === 'ios') return undefined;
    const timer = setTimeout(() => latest.current?.(), FADE_OUT_MS);
    return () => clearTimeout(timer);
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
      onDismiss={Platform.OS === 'ios' ? () => latest.current?.() : undefined}
    >
      <View className="flex-1" pointerEvents={visible ? 'auto' : 'none'}>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: shade }}
        />
        {visible ? children : lastShown}
      </View>
    </Modal>
  );
}

/** The shadow a lifted thing casts, the same under every part of the stack. */
export const LIFTED = {
  shadowColor: '#000',
  shadowOpacity: 0.2,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 8 },
  elevation: 8,
} as const;

export interface HoldMenuEntry {
  key: string;
  label: string;
  /** A second line, such as how long Edit is still open for. */
  hint?: string;
  /** Registered with cssInterop by whoever passes it. */
  Icon: LucideIcon;
  destructive?: boolean;
  onPress: () => void;
}

/** How tall a menu of these entries draws, for placing it. */
export function holdMenuHeight(entries: readonly HoldMenuEntry[]): number {
  return entries.reduce(
    (sum, e, i) =>
      sum + (e.hint ? MENU_ROW_TALL : MENU_ROW) + (e.destructive && i > 0 ? MENU_BREAK : i > 0 ? 1 : 0),
    0,
  );
}

/**
 * The menu under something held: a white card of rows, label left, icon
 * right, with the destructive one last and set apart by a thicker rule.
 */
export function HoldMenu({ entries, width = 244 }: { entries: readonly HoldMenuEntry[]; width?: number }) {
  return (
    <View
      accessibilityRole="menu"
      className="bg-card rounded-2xl overflow-hidden"
      style={[{ width }, LIFTED]}
    >
      {entries.map((entry, i) => (
        <Pressable
          key={entry.key}
          onPress={entry.onPress}
          accessibilityRole="menuitem"
          accessibilityLabel={entry.hint ? `${entry.label}, ${entry.hint}` : entry.label}
          className={`px-4 flex-row items-center justify-between gap-3 active:bg-muted/60 ${
            i === 0 ? '' : entry.destructive ? 'border-t-[6px] border-muted' : 'border-t border-muted'
          }`}
          style={{ minHeight: entry.hint ? MENU_ROW_TALL : MENU_ROW }}
        >
          <View className="flex-1 min-w-0">
            <Text
              className={`text-[16px] leading-[21px] ${entry.destructive ? 'text-destructive' : 'text-foreground'}`}
              numberOfLines={1}
            >
              {entry.label}
            </Text>
            {entry.hint ? (
              <Text className="text-muted-foreground text-[12px] leading-4" numberOfLines={1}>
                {entry.hint}
              </Text>
            ) : null}
          </View>
          <entry.Icon
            size={19}
            className={entry.destructive ? 'text-destructive' : 'text-foreground'}
          />
        </Pressable>
      ))}
    </View>
  );
}
