import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useIsFocused } from '@react-navigation/native';
import {
  Easing,
  makeMutable,
  useAnimatedScrollHandler,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

/**
 * Whether the bars are showing, shared between them and every screen that
 * scrolls.
 *
 * The bars are drawn in two different places — the top one inside each screen,
 * the bottom one by the navigator — so neither can watch a scroll view itself.
 * A screen reports its scrolling here and both bars read the one value.
 *
 * `hidden` is 0 showing and 1 hidden, and it lives on the UI thread: the
 * scrolling that moves it is read there too (useChromeScroll), so the bars
 * answer the finger even while JavaScript is busy drawing the list. Each bar
 * moves by transform alone — the top one slides up under the status bar
 * (TabScreen), the bottom one slides out past the edge.
 *
 * It used to be an RN Animated value on the native driver, which cannot move
 * a layout property. The top bar animated its height from it, so it faded out
 * and then the whole screen jumped up by the bar's height in one frame.
 */
export interface Chrome {
  hidden: SharedValue<number>;
  /**
   * Put the bars back. The tabs call it whenever a screen comes into focus, so
   * no screen — least of all one that never reports its scrolling — can open
   * with its navigation already gone.
   */
  reveal: () => void;
  /** Where the last counted scroll was; null means "only record the next one". */
  lastY: SharedValue<number | null>;
  isHidden: SharedValue<boolean>;
}

/**
 * Enough movement to count as a deliberate scroll.
 *
 * Without it the bars flicker on the small deltas a finger produces while it
 * is resting.
 */
const THRESHOLD = 8;

/**
 * How far down before hiding is allowed at all.
 *
 * The bars stay put near the top of a list, so a short list can never scroll
 * its own navigation away and leave somebody with no way out.
 */
const FLOOR = 56;

/** Material's standard curve: off the mark quickly, settling gently. */
const MOTION = { duration: 240, easing: Easing.bezier(0.2, 0, 0, 1) };

/**
 * The fallback is real values and a real no-op, not undefined.
 *
 * A bar rendered outside the provider — a screen opened from a deep link
 * before the tabs mount — reads 0 and stays visible, rather than throwing.
 */
const FALLBACK: Chrome = {
  hidden: makeMutable(0),
  reveal: () => {},
  lastY: makeMutable<number | null>(0),
  isHidden: makeMutable(false),
};

const ChromeContext = createContext<Chrome>(FALLBACK);

/**
 * The top bar's measured height, kept apart from the rest so the scrolling
 * side — which every list reads — never re-renders when it is measured.
 * Every tab screen wears the same bar, so one figure serves them all.
 */
interface BarHeight {
  barHeight: number;
  setBarHeight: (height: number) => void;
}

const BarHeightContext = createContext<BarHeight>({ barHeight: 0, setBarHeight: () => {} });

export function ChromeProvider({ children }: { children: ReactNode }) {
  const [barHeight, setBarHeight] = useState(0);
  const bar = useMemo(() => ({ barHeight, setBarHeight }), [barHeight]);
  const hidden = useSharedValue(0);
  // Null after a reveal: the next scroll may come from a list that is already
  // far down — the screen just returned to, or another tab entirely. Measured
  // against 0 it read as one huge downward scroll and hid the bars again on
  // the first frame, so the first event only records where the list is.
  const lastY = useSharedValue<number | null>(0);
  const isHidden = useSharedValue(false);

  const value = useMemo<Chrome>(
    () => ({
      hidden,
      lastY,
      isHidden,
      reveal: () => {
        lastY.value = null;
        if (!isHidden.value) return;
        isHidden.value = false;
        hidden.value = withTiming(0, MOTION);
      },
    }),
    [hidden, lastY, isHidden],
  );

  return (
    <ChromeContext.Provider value={value}>
      <BarHeightContext.Provider value={bar}>{children}</BarHeightContext.Provider>
    </ChromeContext.Provider>
  );
}

export function useChrome(): Chrome {
  return useContext(ChromeContext);
}

export function useBarHeight(): BarHeight {
  return useContext(BarHeightContext);
}

/**
 * Brings the bars back when the screen shows something too short to scroll:
 * an empty state, a failure, a placeholder.
 *
 * Scrolling is the only other thing that moves them, and a list that fits
 * the screen cannot scroll. Switch the Feed to an empty Connections, or Jobs
 * to an empty sub-tab, with the bars hidden, and nothing could bring them
 * back — no top bar, no +, no tabs. Only on the screen in front, so a tab in
 * the background loading its empty state does not move them under the
 * screen you are on.
 */
export function useRevealOnMount(): void {
  const { reveal } = useChrome();
  const focused = useIsFocused();
  useEffect(() => {
    if (focused) reveal();
  }, [focused, reveal]);
}

/**
 * The scroll handler that moves the bars. Give it to a Reanimated
 * `Animated.ScrollView` or `Animated.FlatList` as `onScroll`, with
 * `scrollEventThrottle={16}`; a plain RN list cannot take it.
 *
 * It runs on the UI thread. Read from JavaScript, the scroll arrived late
 * whenever the list was busy rendering — the Feed most of all — and the bars
 * went after the finger had already stopped.
 */
export function useChromeScroll() {
  const { hidden, lastY, isHidden } = useChrome();

  return useAnimatedScrollHandler({
    // Each drag is measured from where it starts. Several lists share the one
    // mark — the tabs inside Jobs each have their own — and a drag on one
    // measured against where another had been left read as a jump.
    onBeginDrag: (event) => {
      const end = Math.max(event.contentSize.height - event.layoutMeasurement.height, 0);
      lastY.value = Math.min(Math.max(event.contentOffset.y, 0), end);
    },
    onScroll: (event) => {
      // Clamped to the list's own range. The rubber-band past either end
      // reports offsets that are not scrolling: past the top it is the list
      // coming home (the bars belong on screen, and the floor sees to that);
      // past the bottom it springs back upwards, which read as "scrolling
      // up" and brought the bars back every time a list hit its end.
      const end = Math.max(event.contentSize.height - event.layoutMeasurement.height, 0);
      const y = Math.min(Math.max(event.contentOffset.y, 0), end);

      const last = lastY.value;
      if (last === null) {
        lastY.value = y;
        return;
      }
      const delta = y - last;
      // Only update the mark once something has actually happened, so a slow
      // drag accumulates towards the threshold instead of resetting under it
      // on every frame.
      if (Math.abs(delta) < THRESHOLD) return;
      lastY.value = y;

      const next = y > FLOOR && delta > 0;
      if (next === isHidden.value) return;
      isHidden.value = next;
      hidden.value = withTiming(next ? 1 : 0, MOTION);
    },
  });
}
