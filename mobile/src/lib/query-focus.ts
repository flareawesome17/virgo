import { AppState, type AppStateStatus } from 'react-native';
import { focusManager } from '@tanstack/react-query';

/**
 * Teaches React Query what "focused" means on a phone.
 *
 * `refetchOnWindowFocus` is a browser idea and does nothing in React Native out
 * of the box — there is no window to focus, so no focus event is ever produced
 * and the option may as well not be set. That is a large part of why the app
 * only ever updated when you pulled to refresh.
 *
 * Wiring AppState into focusManager makes returning to the app a focus event,
 * so a phone coming out of your pocket shows current data rather than whatever
 * it was displaying when you locked it.
 *
 * Online status is deliberately not touched here — useOffline already drives
 * `onlineManager` from NetInfo, and two writers would fight.
 *
 * Called once from the root layout. Returns a cleanup so Fast Refresh does not
 * stack listeners.
 */
export function wireQueryFocusToAppState(): () => void {
  const onChange = (status: AppStateStatus) => {
    // 'inactive' is the iOS half-state during an app switch, a call banner or
    // the notification shade. Treating it as unfocused would fire a refetch
    // every time somebody opened the app switcher and came straight back.
    focusManager.setFocused(status === 'active');
  };

  const subscription = AppState.addEventListener('change', onChange);
  focusManager.setFocused(AppState.currentState === 'active');

  return () => subscription.remove();
}
