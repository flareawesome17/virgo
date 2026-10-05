import { useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import { useNavigation } from 'expo-router';
import { usePreventRemove } from '@react-navigation/native';

/**
 * Asks before a form with something typed in it is thrown away.
 *
 * The X, Cancel, Android's back and the iOS swipe all left a half-written job
 * post, event, reminder or showcase without a word, and it was gone. The
 * full-screen forms were chosen to protect exactly that and did not.
 *
 * `values` is what the form holds; it is compared with what it held once it
 * was `ready` (straight away for a new one, after the saved values have been
 * filled in for an edit), so opening an edit and closing it asks nothing.
 * Call `allowLeave` before leaving after a save, which is a leave nobody
 * needs to confirm.
 */
export function useDiscardGuard(values: unknown, ready = true): {
  dirty: boolean;
  allowLeave: () => void;
  /** After a save that stays on the screen: what is there now is kept. */
  markSaved: () => void;
} {
  const navigation = useNavigation();
  const base = useRef<string | null>(null);
  const leaving = useRef(false);

  const now = JSON.stringify(values);
  if (ready && base.current === null) base.current = now;
  const dirty = base.current !== null && now !== base.current;

  usePreventRemove(dirty, ({ data }) => {
    if (leaving.current) {
      navigation.dispatch(data.action);
      return;
    }
    Alert.alert('Discard your changes?', 'What you have typed here will be lost.', [
      { text: 'Keep editing', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          leaving.current = true;
          navigation.dispatch(data.action);
        },
      },
    ]);
  });

  const allowLeave = useCallback(() => {
    leaving.current = true;
  }, []);

  // Taken again from the next render's values.
  const markSaved = useCallback(() => {
    base.current = null;
  }, []);

  return { dirty, allowLeave, markSaved };
}
