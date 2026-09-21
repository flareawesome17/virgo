/**
 * Getting someone's attention in a browser tab.
 *
 * The mobile app has a notification channel and a haptics engine; a web page
 * has neither. What it does have is a title bar the user can see from another
 * tab, an optional OS notification, and — on Android — a vibrator. All three
 * are best-effort and none of them are load-bearing.
 */

/**
 * Puts an unread count in front of the page title.
 *
 * The one attention signal that always works: it needs no permission, and it
 * is visible from a tab the user is not looking at, which is the whole point.
 *
 * Reads the live title on every call rather than caching a "base" once. The
 * cached version took whatever happened to be in the tab the first time a
 * count arrived — the sign-in page — and every screen after that read
 * "(3) Sign in · Virgo" regardless of where you were.
 *
 * Reading fresh is safe here only because this runs when the count changes,
 * never during a navigation: Next re-asserts the route's title from its
 * metadata a few milliseconds after each client navigation, so anything
 * written at that moment loses. That is also why the *page name* is not set
 * here — see the note in app-shell.tsx.
 */
export function setUnreadTitle(count: number): void {
  if (typeof document === 'undefined') return;
  const base = document.title.replace(/^\(\d+\+?\)\s*/, '');
  const n = Math.max(0, count);
  document.title = n > 0 ? `(${n > 99 ? '99+' : n}) ${base}` : base;
}

/** True once the user has allowed OS notifications for this origin. */
export function canNotify(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    Notification.permission === 'granted'
  );
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

const permissionListeners = new Set<() => void>();

/**
 * Subscribes to `notificationPermission()`, for useSyncExternalStore.
 *
 * Announces the answer to `requestNotificationPermission`. A change made in
 * the browser's own site settings is not announced; it shows the next time
 * the page renders.
 */
export function subscribeToNotificationPermission(onChange: () => void): () => void {
  permissionListeners.add(onChange);
  return () => {
    permissionListeners.delete(onChange);
  };
}

/**
 * Asks for notification permission.
 *
 * Only ever called from an explicit user action. Browsers penalise origins
 * that prompt on load, and so do users.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    return (await Notification.requestPermission()) === 'granted';
  } catch {
    return false;
  } finally {
    for (const listener of permissionListeners) listener();
  }
}

/**
 * True inside the desktop app. There the Notification API is the notification
 * plugin's stand-in, which hands the alert to the system's notification centre.
 */
function inDesktopApp(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

/**
 * Announces a new message, or any other notification, as a system alert.
 *
 * Silent only while someone is actually looking: the page visible *and* its
 * window focused. A window behind others still counts as visible to the page,
 * and that is the usual state of the desktop app while its owner works in
 * something else — exactly when an alert is worth having. For something you
 * are looking at, it is just noise.
 */
export function notifyMessage(options: {
  title: string;
  body: string;
  /** Deduplicates: a busy thread replaces its own notification rather than stacking. */
  tag?: string;
  onClick?: () => void;
}): void {
  if (
    typeof document !== 'undefined' &&
    document.visibilityState === 'visible' &&
    document.hasFocus()
  ) {
    return;
  }
  if (!canNotify()) return;

  try {
    const notification = new Notification(options.title, {
      body: options.body,
      tag: options.tag,
      // The desktop app's alerts carry the app's own icon. A path like this
      // one would be taken there as a file on disk, not a page on the site.
      ...(inDesktopApp() ? {} : { icon: '/icon.png' }),
    });
    notification.onclick = () => {
      window.focus();
      options.onClick?.();
      notification.close();
    };
  } catch {
    // Some browsers throw when constructing a Notification outside a service
    // worker. The title-bar count still carries the signal.
  }
}

/**
 * A short buzz, where the device has a vibrator.
 *
 * Android Chrome only — iOS Safari and every desktop browser ignore it, which
 * is why this is an extra rather than the mechanism.
 */
export function buzzForMessage(): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
    return;
  }
  try {
    navigator.vibrate([60, 40, 60]);
  } catch {
    // Blocked by a permissions policy, or no vibrator.
  }
}
