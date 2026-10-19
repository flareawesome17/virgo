import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Keyboard,
  Platform,
  TextInput,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
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
};

/** Room left between a revealed field and the keyboard's top edge. */
const REVEAL_GAP = 24;

function measurable(node: unknown): Measurable | null {
  return node && typeof (node as Measurable).measureInWindow === 'function' ? (node as Measurable) : null;
}

/**
 * Keeps the field being typed in above the keyboard, in a form that scrolls.
 *
 * KeyboardAvoidingView was meant to, and on a phone it did not. Android draws
 * edge to edge from SDK 54, where it can leave the form at full height; and
 * even where it did shrink the form, nothing scrolled the focused field back
 * into what was left. The Note, last on the new-entry form, stayed under the
 * keyboard while it was typed in.
 *
 * So this measures instead of assuming. When the keyboard comes up, or a field
 * takes focus while it is up, the field's place on screen is compared with the
 * keyboard's top edge and the form scrolls by exactly the overlap. While the
 * keyboard is up the form gets the keyboard's height as room at its end, so
 * even the last field can scroll clear of it, whether or not the system also
 * resized the window.
 *
 * Spread `onScroll`/`scrollEventThrottle` and `ref` on the ScrollView, add
 * `room` to its bottom padding, and give every TextInput `onFocus`.
 */
export function useKeyboardAwareScroll() {
  const scrollRef = useRef<ScrollView>(null);
  const offset = useRef(0);
  const keyboardTop = useRef<number | null>(null);
  const lastFocused = useRef<Measurable | null>(null);
  const [room, setRoom] = useState(0);

  const reveal = useCallback(() => {
    const top = keyboardTop.current;
    const state = TextInput.State as { currentlyFocusedInput?: () => unknown; currentlyFocusedField?: () => unknown };
    // The host input on iOS and Android; the DOM node in the web preview.
    const input =
      measurable(state?.currentlyFocusedInput?.()) ??
      measurable(state?.currentlyFocusedField?.()) ??
      lastFocused.current;
    if (top === null || !input) return;
    input.measureInWindow((_x, y, _width, height) => {
      const overlap = y + height + REVEAL_GAP - top;
      if (overlap > 0) scrollRef.current?.scrollTo({ y: offset.current + overlap, animated: true });
    });
  }, []);

  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const shown = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (event) => {
      const { height, screenY } = event.endCoordinates;
      keyboardTop.current = screenY > 0 ? screenY : Dimensions.get('window').height - height;
      setRoom(height);
      // Once the room is laid out, so the scroll can reach it; on iOS, once
      // the keyboard has finished rising.
      setTimeout(reveal, ios ? Math.max(event.duration ?? 0, 120) : 120);
    });
    const hidden = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => {
      keyboardTop.current = null;
      setRoom(0);
    });
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, [reveal]);

  const onFocus = useCallback(
    (event?: { currentTarget?: unknown; target?: unknown }) => {
      const target = measurable(event?.currentTarget) ?? measurable(event?.target);
      if (target) lastFocused.current = target;
      // A field tapped while the keyboard is already up gets no keyboard event.
      setTimeout(reveal, 60);
    },
    [reveal],
  );

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.current = event.nativeEvent.contentOffset.y;
  }, []);

  return { scrollRef, onScroll, scrollEventThrottle: 16, onFocus, room };
}
