/**
 * Getting someone's attention in a browser tab.
 *
 * The mobile app has a notification channel and a haptics engine; a web page
 * has neither. What it does have is a title bar the user can see from another
 * tab, an optional OS notification, and — on Android — a vibrator. All three
 * are best-effort and none of them are load-bearing.
 */

/** Set while the tab is showing an unread count, so it can be put back. */
let baseTitle: string | null = null;

/**
 * Puts an unread count in front of the page title.
 *
 * The one attention signal that always works: it needs no permission, and it
 * is visible from a tab the user is not looking at, which is the whole point.
 */
export function setUnreadTitle(count: number): void {
  if (typeof document === 'undefined') return;
  baseTitle ??= document.title.replace(/^\(\d+\+?\)\s*/, '');
  document.title = count > 0 ? `(${count > 99 ? '99+' : count}) ${baseTitle}` : baseTitle;
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
  }
}

/**
 * Announces a new message.
 *
 * Silent when the tab is focused — the message is already on screen, and a
 * notification for something you are looking at is just noise.
 */
export function notifyMessage(options: {
  title: string;
  body: string;
  /** Deduplicates: a busy thread replaces its own notification rather than stacking. */
  tag?: string;
  onClick?: () => void;
}): void {
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') return;
  if (!canNotify()) return;

  try {
    const notification = new Notification(options.title, {
      body: options.body,
      tag: options.tag,
      icon: '/icon.png',
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
