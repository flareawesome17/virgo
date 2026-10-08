import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

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
