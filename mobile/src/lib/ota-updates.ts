import { AppState, type AppStateStatus } from 'react-native';
import * as Updates from 'expo-updates';

/**
 * How long the app must have been in the background before a downloaded update
 * is allowed to apply.
 *
 * Applying is a reload: the app restarts on the new bundle. Doing that when
 * somebody glanced at a notification and came straight back would throw away
 * what they were in the middle of, which is worse than waiting. Half a minute
 * away is long enough that a restart reads as "the app was opened" rather than
 * "the app just lost my place".
 */
const SETTLED_AWAY_MS = 30_000;

/**
 * The shortest gap between two checks.
 *
 * A check is one small request for a manifest, but the app comes to the
 * foreground every time a phone leaves a pocket, and there is no version of
 * this worth asking about more than a few times an hour.
 */
const CHECK_EVERY_MS = 15 * 60_000;

/**
 * Makes updates arrive the way people expect them to.
 *
 * Out of the box `expo-updates` checks once, at launch, and with
 * `fallbackToCacheTimeout: 0` it does not wait for the answer — the app starts
 * on the bundle it already has and downloads the new one behind it. That
 * download then sits there until the *next* cold start, so shipping a fix and
 * seeing it on a device are two launches apart, and nobody who keeps the app
 * resident ever gets it at all.
 *
 * This closes that gap: check while the app runs, download in the background,
 * and apply when the user next returns after being properly away. The restart
 * lands at the moment they are already expecting the app to redraw, so an
 * update that was published an hour ago is simply there.
 *
 * Deliberately silent. There is no "update available" prompt, because there is
 * no decision to offer — the new bundle is the app, and a dialog asking
 * permission to be current is a dialog that gets dismissed.
 *
 * Called once from the root layout. Returns a cleanup, so Fast Refresh does
 * not stack listeners, matching wireQueryFocusToAppState.
 */
export function wireOtaUpdates(): () => void {
  // `isEnabled` is false in Expo Go and in development builds, where the
  // bundle comes from Metro and a reload would fight the dev server. Checking
  // it rather than __DEV__ alone also covers a release build with updates
  // switched off, where these calls throw rather than no-op.
  if (!Updates.isEnabled) return () => {};

  let checking = false;
  let lastCheckedAt = 0;
  /** Set once a new bundle is on disk and waiting for a moment to apply. */
  let downloaded = false;
  let leftAt: number | null = null;

  const check = async () => {
    if (checking || downloaded) return;
    if (Date.now() - lastCheckedAt < CHECK_EVERY_MS) return;

    checking = true;
    lastCheckedAt = Date.now();
    try {
      const result = await Updates.checkForUpdateAsync();
      if (!result.isAvailable) return;

      const fetched = await Updates.fetchUpdateAsync();
      // `isNew` is false for a roll-back to the embedded bundle, which is a
      // real outcome and not one to reload for here — the embedded bundle is
      // what a fresh launch would use anyway.
      downloaded = fetched.isNew;
    } catch {
      // Offline, a server having a bad minute, or a manifest this binary
      // cannot use. None of it is the user's problem and none of it should
      // reach them: the app goes on running the bundle it has, which works.
    } finally {
      checking = false;
    }
  };

  const onChange = (status: AppStateStatus) => {
    if (status !== 'active') {
      // 'inactive' is iOS's half-state — the app switcher, a call banner, the
      // notification shade. Recording the first non-active moment rather than
      // overwriting it means a quick glance does not reset the clock and
      // disguise a long absence as a short one.
      leftAt ??= Date.now();
      return;
    }

    const away = leftAt === null ? 0 : Date.now() - leftAt;
    leftAt = null;

    if (downloaded && away >= SETTLED_AWAY_MS) {
      // Nothing after this line runs: the app restarts on the new bundle.
      Updates.reloadAsync().catch(() => {
        // A reload that fails leaves the app running the old bundle, which is
        // the state it was already in. Kept as `downloaded` so the next return
        // tries again rather than needing another download.
      });
      return;
    }

    void check();
  };

  const subscription = AppState.addEventListener('change', onChange);
  // The launch-time check `expo-updates` does on its own cannot be observed
  // from here, so this one establishes whether a bundle is already waiting —
  // which decides whether the very next return applies it.
  void check();

  return () => subscription.remove();
}
