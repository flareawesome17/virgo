import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Keyboard,
  LayoutAnimation,
  Platform,
  TextInput,
  type KeyboardEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
  type View,
} from 'react-native';

/**
 * Whether the keyboard is up, on both platforms.
 *
 * Only iOS was tracked, so on Android the composer kept the navigation bar's
 * padding under it while the keyboard covered that strip, and sat that much
 * above the keyboard.
 */
export function useKeyboardUp(): boolean {
  const [up, setUp] = useState(false);
  useEffect(() => {
    const show = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hide = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const a = Keyboard.addListener(show, () => setUp(true));
    const b = Keyboard.addListener(hide, () => setUp(false));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);
  return up;
}

/** Anything on screen that can say where it is. */
type Measurable = {
  measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => void;
  measure?: (
    callback: (x: number, y: number, width: number, height: number, pageX: number, pageY: number) => void,
  ) => void;
};

/** Room left between a revealed field and the keyboard's top edge. */
const REVEAL_GAP = 24;

function measurable(node: unknown): Measurable | null {
  return node && typeof (node as Measurable).measureInWindow === 'function' ? (node as Measurable) : null;
}

/**
 * How far below the top of the screen measureInWindow counts from: on
 * Android, the status bar; elsewhere, nothing.
 *
 * Android says where the keyboard's top edge is on the screen, counted from
 * the very top. measureInWindow counts from the bottom of the status bar
 * instead (React Native takes the visible display frame's top off it). Compared
 * as they came, every form put the keyboard a status bar lower than it is: the
 * Save button rose that much too little, and the field being typed in stayed
 * partly under the keyboard. `measure` counts from the top of the screen, so
 * on any view the two differ by exactly that.
 */
function windowOffset(node: Measurable | null, done: (offset: number) => void) {
  if (Platform.OS !== 'android' || typeof node?.measure !== 'function') {
    done(0);
    return;
  }
  node.measure((_x, _y, _width, _height, _pageX, pageY) => {
    node.measureInWindow((_wx, windowY) => {
      const offset = pageY - windowY;
      done(Number.isFinite(offset) && offset > 0 ? offset : 0);
    });
  });
}

/**
 * Where a view starts, in the keyboard's terms: what a KeyboardAvoidingView
 * inside it needs as keyboardVerticalOffset when the view does not start at
 * the top of the window (the upload strip or the email banner pushes it down).
 *
 * measureInWindow, except on Android, where it counts from below the status
 * bar while the keyboard is placed from the top of the screen. There `measure`
 * is used: its pageY counts from the top. With measureInWindow, the chat's
 * composer sat a status bar under the keyboard's edge while an upload ran.
 */
export function measureScreenTop(node: unknown, done: (top: number) => void) {
  const target = measurable(node);
  if (!target) return;
  if (Platform.OS === 'android' && typeof target.measure === 'function') {
    target.measure((_x, _y, _width, _height, _pageX, pageY) => done(Math.max(0, Math.round(pageY))));
    return;
  }
  target.measureInWindow((_x, y) => done(Math.max(0, Math.round(y))));
}

/** The field being typed in: the host input on iOS and Android, the DOM node on the web. */
function focusedInput(): Measurable | null {
  const state = TextInput.State as { currentlyFocusedInput?: () => unknown; currentlyFocusedField?: () => unknown };
  return measurable(state?.currentlyFocusedInput?.()) ?? measurable(state?.currentlyFocusedField?.());
}

/** Moves the next layout with the keyboard, as KeyboardAvoidingView did on iOS. */
function followKeyboard(event?: KeyboardEvent) {
  if (Platform.OS !== 'ios' || !event?.duration) return;
  LayoutAnimation.configureNext({
    duration: event.duration,
    update: { type: LayoutAnimation.Types.keyboard, duration: event.duration },
  });
}

/**
 * Keeps the field being typed in above the keyboard, in a form that scrolls.
 *
 * KeyboardAvoidingView was meant to, and on a phone it did not. Android draws
 * edge to edge from SDK 54, where it can leave the form at full height; and
 * even where it did shrink the form, nothing scrolled the focused field back
 * into what was left. The Note, last on the new-entry form, stayed under the
 * keyboard while it was typed in, and so did the Notes on a new event.
 *
 * So this measures instead of assuming. When the keyboard comes up, or a field
 * takes focus while it is up, the field's place on screen is compared with the
 * keyboard's top edge (or the bottom of the scrolling part, when a footer sits
 * above the keyboard) and the form scrolls by exactly the overlap.
 *
 * Two ways to use it:
 *  - Alone, as the Money forms do: spread `onScroll`/`scrollEventThrottle` and
 *    `ref` on the ScrollView, add `room` to its bottom padding, and give every
 *    TextInput `onFocus`. The form gets the keyboard's height as room at its
 *    end, so even the last field can scroll clear of it.
 *  - Through KeyboardFrame and KeyboardScroll (components/KeyboardForm), which
 *    also lift a footer above the keyboard: `lifts` turns that on, and the
 *    frame's own bottom is measured against the keyboard, so the lift is only
 *    what the system did not already take away by resizing the window.
 */
export function useKeyboardAwareScroll(options?: {
  lifts?: boolean;
  /** Whether this screen is the one in front. Screens behind it stay mounted. */
  active?: () => boolean;
}) {
  const lifts = options?.lifts ?? false;
  const activeRef = useRef(options?.active);
  activeRef.current = options?.active;
  const scrollRef = useRef<ScrollView>(null);
  /** The scrolling part's box on screen, so a footer above the keyboard counts. */
  const viewportRef = useRef<View>(null);
  /** Everything the keyboard should push up: the scroller and its footer. */
  const frameRef = useRef<View>(null);
  const offset = useRef(0);
  const keyboardTop = useRef<number | null>(null);
  const lastFocused = useRef<Measurable | null>(null);
  const [room, setRoom] = useState(0);
  const [lift, setLift] = useState(0);
  const liftRef = useRef(0);

  const reveal = useCallback(() => {
    const top = keyboardTop.current;
    const input = focusedInput() ?? lastFocused.current;
    if (top === null || !input) return;
    const scrollBy = (limit: number, viewportTop: number | null) => {
      input.measureInWindow((_x, y, _width, height) => {
        let overlap = y + height + REVEAL_GAP - limit;
        // A tall note keeps its first lines in view rather than its last.
        if (viewportTop !== null) overlap = Math.min(overlap, y - viewportTop - REVEAL_GAP);
        if (overlap > 0) scrollRef.current?.scrollTo({ y: offset.current + overlap, animated: true });
      });
    };
    const viewport = measurable(viewportRef.current);
    if (!viewport) {
      scrollBy(top, null);
      return;
    }
    viewport.measureInWindow((_vx, viewportY, _vw, viewportHeight) => {
      const limit = Math.min(top, viewportY + viewportHeight);
      // Only a field in the scrolling content: one in the footer (a reply box)
      // rises with the footer and has nothing to scroll to.
      // In the runtime since RN 0.64, though the types leave it out.
      const scroller = scrollRef.current as (ScrollView & { getInnerViewRef?: () => unknown }) | null;
      const content = measurable(scroller?.getInnerViewRef?.());
      if (!content) {
        scrollBy(limit, viewportY);
        return;
      }
      content.measureInWindow((_cx, contentY, _cw, contentHeight) => {
        input.measureInWindow((_x, y) => {
          if (y >= contentY && y < contentY + contentHeight) scrollBy(limit, viewportY);
        });
      });
    });
  }, []);

  /** How far the frame reaches under the keyboard, which is how far to lift it. */
  const measureLift = useCallback((event?: KeyboardEvent) => {
    const frame = measurable(frameRef.current);
    if (!frame) return;
    const top = keyboardTop.current;
    frame.measureInWindow((_x, y, _width, height) => {
      // The frame's own box: the lift is padding inside it, so it stays put.
      const next = top === null ? 0 : Math.max(0, Math.round(y + height - top));
      if (next === liftRef.current) return;
      liftRef.current = next;
      followKeyboard(event);
      setLift(next);
    });
  }, []);

  useEffect(() => {
    const ios = Platform.OS === 'ios';
    let watch: ReturnType<typeof setInterval> | null = null;
    const stopWatching = () => {
      if (watch) clearInterval(watch);
      watch = null;
    };
    /** Which showing of the keyboard a measurement belongs to, so a late one is dropped. */
    let showing = 0;
    const shown = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (event) => {
      if (activeRef.current && !activeRef.current()) return;
      const { height, screenY } = event.endCoordinates;
      const thisShowing = ++showing;
      // Into measureInWindow's terms, where every field and frame is measured.
      const node =
        measurable(frameRef.current) ??
        measurable(viewportRef.current) ??
        measurable(scrollRef.current) ??
        focusedInput();
      windowOffset(node, (offset) => {
        if (thisShowing !== showing) return;
        keyboardTop.current = screenY > 0 ? screenY - offset : Dimensions.get('window').height - height;
        if (lifts) measureLift(event);
      });
      if (!lifts) setRoom(height);
      // Once the room is laid out, so the scroll can reach it; on iOS, once
      // the keyboard has finished rising.
      setTimeout(reveal, ios ? Math.max(event.duration ?? 0, 120) + 20 : 140);
      // Moving to another field leaves the keyboard up, so no event says so.
      // Fields that call onFocus say it at once; for a screen's own TextInput,
      // this notices within a beat, for as long as the keyboard is up.
      if (lifts && !watch) {
        let current = focusedInput();
        watch = setInterval(() => {
          const next = focusedInput();
          if (next && next !== current) setTimeout(reveal, 0);
          current = next;
        }, 200);
      }
    });
    const hidden = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', (event) => {
      showing++;
      stopWatching();
      keyboardTop.current = null;
      setRoom(0);
      if (lifts && liftRef.current !== 0) {
        liftRef.current = 0;
        followKeyboard(event);
        setLift(0);
      }
    });
    return () => {
      stopWatching();
      shown.remove();
      hidden.remove();
    };
  }, [reveal, measureLift, lifts]);

  const onFocus = useCallback(
    (event?: { currentTarget?: unknown; target?: unknown }) => {
      const target = measurable(event?.currentTarget) ?? measurable(event?.target);
      if (target) lastFocused.current = target;
      // A field tapped while the keyboard is already up gets no keyboard event.
      setTimeout(reveal, 60);
    },
    [reveal],
  );

  /** A note growing a line as it is typed: keep its end in view. */
  const onGrow = useCallback(() => {
    if (keyboardTop.current !== null) setTimeout(reveal, 0);
  }, [reveal]);

  /**
   * The frame moved or changed size: on Android the system may resize the
   * window after the keyboard event, and then the lift it measured is too much.
   */
  const onFrameLayout = useCallback(() => {
    if (keyboardTop.current !== null) measureLift();
  }, [measureLift]);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.current = event.nativeEvent.contentOffset.y;
  }, []);

  return {
    scrollRef,
    viewportRef,
    frameRef,
    onScroll,
    scrollEventThrottle: 16,
    onFocus,
    onGrow,
    onFrameLayout,
    room,
    lift,
  };
}
