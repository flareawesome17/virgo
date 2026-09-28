import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Keyboard,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/src/hooks';
import { PALETTES } from '@/theme';

/**
 * How a sheet moves: quick off the mark and settling gently into place, the
 * curve iOS uses for its own sheets. Leaving is shorter and gathers speed, so
 * the screen is back under your thumb sooner than the sheet arrived.
 */
const ENTER = Easing.bezier(0.32, 0.72, 0, 1);
const EXIT = Easing.bezier(0.3, 0, 0.8, 0.15);
const ENTER_MS = 380;
const EXIT_MS = 240;

/** Roughly the keyboard's own curve, so a sheet rises with it rather than after it. */
const KEYBOARD = Easing.bezier(0.2, 0.8, 0.2, 1);

/** Pulled down this far, or flicked, and it goes. */
const DISMISS_DISTANCE = 110;
const DISMISS_VELOCITY = 1.1;

/**
 * The dim behind a sheet or a dialog. Always a darkening, whatever the theme:
 * the text colour, which some used, is near-white in dark mode and washed the
 * screen out instead of dimming it.
 */
export function useShade(): string {
  const { isDark } = useTheme();
  return isDark ? `${PALETTES.dark.background}B8` : `${PALETTES.light.foreground}73`;
}

/**
 * A sheet that rises from the bottom over a dimmed screen: every bottom sheet
 * in the app, so they all move and sit the same way.
 *
 * They were Modals with `animationType="slide"`, which slides the modal's whole
 * window — the dim included. So the shade rode up with the sheet as if it were
 * a see-through part of it, and in dark mode it was a pale wash, being the
 * text colour at forty per cent. Here the shade fades in where it is, always
 * dark, while only the sheet rises.
 *
 * It keeps clear of the phone's edges itself: its content stops above the
 * home indicator or Android's navigation bar, however it is built. Sheets gave
 * themselves fixed bottom padding before, which on an iPhone is less than the
 * home indicator and on Android puts the last button under the navigation bar
 * — modals there run edge to edge. It also never rises under the status bar,
 * and lifts above the keyboard for a sheet that has fields.
 *
 * `onClosed` comes once it has fully gone, on both platforms: the moment
 * another sheet can follow it, since iOS will not present a modal over one
 * that is still leaving.
 */
export function BottomSheet({
  visible,
  onClose,
  onClosed,
  dismissible = true,
  handle = true,
  surface = 'card',
  closeLabel = 'Close',
  children,
}: {
  visible: boolean;
  /** Asked to close: a tap on the shade, the back button, or a swipe down. */
  onClose: () => void;
  /** Once it has fully gone. */
  onClosed?: () => void;
  /**
   * False for a sheet that must be answered: the shade, the back button and a
   * swipe all leave it where it is, and the sheet's own buttons decide.
   */
  dismissible?: boolean;
  /**
   * The bar across the top that says it can be pulled down. Off for a sheet
   * that is never dismissed that way; its content then brings its own space.
   */
  handle?: boolean;
  surface?: 'card' | 'background';
  /** What a screen reader calls the shade. */
  closeLabel?: string;
  children: ReactNode;
}) {
  const shade = useShade();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  // Mounted from the moment it is asked for until it has finished leaving.
  const [mounted, setMounted] = useState(visible);
  // On the way out it goes on showing what it showed last. A screen often
  // clears whatever it opened a sheet for as it closes it, and the sheet
  // should not empty itself, or turn into another, as it leaves.
  const [lastShown, setLastShown] = useState(children);
  if (visible && lastShown !== children) setLastShown(children);
  const [keyboardLift, setKeyboardLift] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  // 0 is out of sight, 1 is in place; the shade's opacity follows it too.
  const progress = useRef(new Animated.Value(0)).current;
  // How far below its place "out of sight" is: its own height once measured,
  // so it travels only as far as it has to.
  const distance = useRef(new Animated.Value(windowHeight)).current;
  const drag = useRef(new Animated.Value(0)).current;
  const keyboardShift = useRef(new Animated.Value(0)).current;
  const measured = useRef(0);
  const opened = useRef(false);

  // The latest props, for the gesture handler and the timers, which outlive
  // the render that made them.
  const latest = useRef({ visible, onClose, onClosed, dismissible });
  latest.current = { visible, onClose, onClosed, dismissible };

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((on) => alive && setReduceMotion(on));
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  const rise = () => {
    opened.current = true;
    Animated.timing(progress, {
      toValue: 1,
      duration: reduceMotion ? 160 : ENTER_MS,
      easing: ENTER,
      useNativeDriver: true,
    }).start();
  };

  // Up from just out of sight. With reduced motion it does not travel at all,
  // only fades.
  const start = (height: number) => {
    distance.setValue(reduceMotion ? 0 : height > 0 ? height + 24 : windowHeight);
    rise();
  };

  // Asked for: on screen, and up once it has been measured (see onLayout).
  // Asked to go: down and faded, and only then off screen.
  useEffect(() => {
    if (visible) {
      setMounted(true);
      // Asked for again while it was still leaving: back up from where it is.
      if (opened.current) rise();
      return;
    }
    if (!opened.current) {
      measured.current = 0;
      setMounted(false);
      return;
    }
    // The keyboard goes down with it rather than after it.
    Keyboard.dismiss();
    // Down by however tall it is now, which may not be what it was on the way
    // up: a sheet can grow while it is open.
    if (!reduceMotion && measured.current > 0) distance.setValue(measured.current + 24);
    Animated.timing(progress, {
      toValue: 0,
      duration: reduceMotion ? 120 : EXIT_MS,
      easing: EXIT,
      useNativeDriver: true,
    }).start(({ finished }) => {
      // Not finished means it was asked for again on the way down.
      if (!finished) return;
      opened.current = false;
      measured.current = 0;
      drag.setValue(0);
      keyboardShift.setValue(0);
      setKeyboardLift(0);
      setMounted(false);
    });
    // The animated values are stable for the life of the sheet, and nothing
    // else it reads should re-run it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Should it never be measured, it comes up anyway rather than leave an
  // invisible shade over the screen, catching every tap.
  useEffect(() => {
    if (!mounted || !visible || opened.current) return;
    const timer = setTimeout(() => {
      if (!opened.current && latest.current.visible) start(measured.current);
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, visible]);

  // Android has no dismissal to wait for, so gone is the moment it unmounts.
  // iOS reports it from the Modal's onDismiss, once the window has gone too.
  const wasMounted = useRef(mounted);
  useEffect(() => {
    const goneNow = wasMounted.current && !mounted;
    wasMounted.current = mounted;
    if (goneNow && Platform.OS !== 'ios') latest.current.onClosed?.();
  }, [mounted]);

  // Clear of the keyboard. The sheet's content stops above the home indicator
  // or navigation bar, which the keyboard covers, so it rises by the part of
  // the keyboard above that. iOS measures its keyboard from the bottom of the
  // screen; Android reports it without the navigation bar already.
  useEffect(() => {
    if (!mounted) return;
    const ios = Platform.OS === 'ios';
    const move = (lift: number, duration?: number) => {
      setKeyboardLift(lift);
      Animated.timing(keyboardShift, {
        toValue: -lift,
        duration: duration || 250,
        easing: KEYBOARD,
        useNativeDriver: true,
      }).start();
    };
    const shown = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (event) => {
      const height = event.endCoordinates.height;
      move(Math.max(0, ios ? height - insets.bottom : height), event.duration);
    });
    const hidden = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', (event) =>
      move(0, event?.duration),
    );
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, [mounted, insets.bottom, keyboardShift]);

  // A pull on the handle: follows the finger down, and either lets go of the
  // sheet or springs it back. The screen can decline to close (a report that
  // is still sending), and then it springs back too.
  const pan = useMemo(() => {
    const settle = () =>
      Animated.spring(drag, { toValue: 0, useNativeDriver: true, bounciness: 0, speed: 18 }).start();
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) =>
        latest.current.dismissible && g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_e, g) => drag.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_e, g) => {
        if (g.dy > DISMISS_DISTANCE || g.vy > DISMISS_VELOCITY) {
          latest.current.onClose();
          requestAnimationFrame(() => {
            if (latest.current.visible) settle();
          });
          return;
        }
        settle();
      },
      onPanResponderTerminate: settle,
    });
  }, [drag]);

  // Built once. Everything that moves the sheet is an animated value, so none
  // of this is rebuilt when the screen re-renders it, as one with a field
  // does on every keystroke.
  const translateY = useMemo(
    () =>
      Animated.add(
        Animated.add(
          Animated.multiply(progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }), distance),
          drag,
        ),
        keyboardShift,
      ),
    [progress, distance, drag, keyboardShift],
  );

  const surfaceColor = surface === 'card' ? 'bg-card' : 'bg-background';

  const requestClose = () => {
    if (latest.current.dismissible) latest.current.onClose();
  };

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      // Edge to edge on Android, as React Native makes every modal there
      // anyway; said here so the insets below are the ones that apply.
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={requestClose}
      onDismiss={Platform.OS === 'ios' ? () => latest.current.onClosed?.() : undefined}
    >
      {/* Nothing in it answers a tap once it is leaving: a second quick tap
          would otherwise run whatever it landed on, too. */}
      <View className="flex-1 justify-end" pointerEvents={visible ? 'auto' : 'none'}>
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            backgroundColor: shade,
            opacity: progress,
          }}
        />
        <Pressable
          onPress={requestClose}
          accessible={dismissible}
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
        />
        <Animated.View
          onLayout={(e) => {
            const height = e.nativeEvent.layout.height;
            measured.current = height;
            // Up the first time it has a height to come up from.
            if (height > 0 && !opened.current && latest.current.visible) start(height);
          }}
          style={{
            transform: [{ translateY }],
            // With reduced motion it does not move, so it fades with the shade.
            opacity: reduceMotion ? progress : 1,
            // Never under the status bar, even with the keyboard up.
            maxHeight: windowHeight - insets.top - 12 - keyboardLift,
          }}
        >
          {/* Shrinks with the cap above, so a sheet's own scrolling list is
              what gives way on a small screen, not its buttons. A little room
              at the bottom even on a phone with no home indicator. */}
          <View
            className={`${surfaceColor} rounded-t-3xl`}
            style={{ paddingBottom: Math.max(insets.bottom, 8), flexShrink: 1 }}
          >
            {/* The handle: something to pull, and a sign that it can be. */}
            {handle ? (
              <View
                {...(dismissible ? pan.panHandlers : {})}
                accessible={false}
                className="items-center pt-2.5 pb-1"
              >
                <View className="w-9 h-1 rounded-full bg-border" />
              </View>
            ) : null}
            {visible ? children : lastShown}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
