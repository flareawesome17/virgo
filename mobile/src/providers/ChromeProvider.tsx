import { createContext, useContext, useMemo, useRef, type ReactNode } from 'react';
import { Animated, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

/**
 * Whether the bars are showing, shared between them and every screen that
 * scrolls.
 *
 * The bars are drawn in two different places — the top one inside each screen,
 * the bottom one by the navigator — so neither can watch a scroll view itself.
 * A screen reports its scrolling here and both bars read the one value.
 *
 * `hidden` is 0 showing and 1 hidden, which is what each bar interpolates its
 * own movement from: the top bar collapses its height, the bottom one slides
 * out past the edge.
 */
export interface Chrome {
  hidden: Animated.Value;
  /** Attach to a scrolling view, with `scrollEventThrottle={16}`. */
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  /**
   * Put the bars back. The tabs call it whenever a screen comes into focus, so
   * no screen — least of all one that never reports its scrolling — can open
   * with its navigation already gone.
   */
  reveal: () => void;
}

/**
 * Enough movement to count as a deliberate scroll.
 *
 * Without it the bars flicker on the small deltas a finger produces while it
 * is resting, and on the rubber-band at the ends of a list.
 */
const THRESHOLD = 8;

/**
 * How far down before hiding is allowed at all.
 *
 * The bars stay put near the top of a list, so a short list can never scroll
 * its own navigation away and leave somebody with no way out.
 */
const FLOOR = 56;

const ANIMATION = { duration: 180, useNativeDriver: true } as const;

/**
 * The fallback is a real value and real no-ops, not undefined.
 *
 * A bar rendered outside the provider — a screen opened from a deep link
 * before the tabs mount — reads 0 and stays visible, rather than throwing.
 */
const FALLBACK: Chrome = {
  hidden: new Animated.Value(0),
  onScroll: () => {},
  reveal: () => {},
};

const ChromeContext = createContext<Chrome>(FALLBACK);

export function ChromeProvider({ children }: { children: ReactNode }) {
  const hidden = useRef(new Animated.Value(0)).current;
  // Refs, not state: this runs on every scroll frame, and re-rendering the
  // whole tab tree sixty times a second to move two bars would cost far more
  // than the bars are worth.
  //
  // Null after a reveal: the next scroll may come from a list that is already
  // far down — the screen just returned to, or another tab entirely. Measured
  // against 0 it read as one huge downward scroll and hid the bars again on
  // the first frame, so the first event only records where the list is.
  const lastY = useRef<number | null>(0);
  const isHidden = useRef(false);

  const value = useMemo<Chrome>(() => {
    const to = (next: boolean) => {
      if (isHidden.current === next) return;
      isHidden.current = next;
      Animated.timing(hidden, { toValue: next ? 1 : 0, ...ANIMATION }).start();
    };

    return {
      hidden,
      onScroll: (event) => {
        const y = event.nativeEvent.contentOffset.y;
        if (lastY.current === null) {
          lastY.current = y;
          return;
        }
        const delta = y - lastY.current;
        // Only update the mark once something has actually happened, so a
        // slow drag accumulates towards the threshold instead of resetting
        // under it on every frame.
        if (Math.abs(delta) < THRESHOLD) return;
        lastY.current = y;
        // Bouncing past the top reports a negative offset; that is the list
        // arriving home, and the bars belong on screen for it.
        if (y <= FLOOR) to(false);
        else to(delta > 0);
      },
      reveal: () => {
        lastY.current = null;
        to(false);
      },
    };
  }, [hidden]);

  return <ChromeContext.Provider value={value}>{children}</ChromeContext.Provider>;
}

export function useChrome(): Chrome {
  return useContext(ChromeContext);
}
