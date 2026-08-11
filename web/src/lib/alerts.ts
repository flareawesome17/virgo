/**
 * Getting someone's attention in a browser tab.
 *
 * The mobile app has a notification channel and a haptics engine; a web page
 * has neither. What it does have is a title bar the user can see from another
 * tab, an optional OS notification, and — on Android — a vibrator. All three
 * are best-effort and none of them are load-bearing.
 */

/*
 * The tab title, which two things want to write at once: the page you are on,
 * and how many messages are waiting.
 *
 * Both are held here and composed by one function, because the alternative was
 * tried and broke. Reading the existing title to find the "base" captured
 * whatever happened to be there the first time a count arrived — the sign-in
 * page — and every screen after that read "(3) Sign in · Virgo" no matter
 * where you actually were.
 *
 * Matches the template in the root layout's metadata, so a client-rendered
 * title is indistinguishable from a server-rendered one.
 */
const SUFFIX = 'Virgo';

let pageTitle: string | null = null;
let unreadCount = 0;

function renderTitle(): void {
  if (typeof document === 'undefined') return;
  const base = pageTitle ? `${pageTitle} · ${SUFFIX}` : SUFFIX;
  document.title =
    unreadCount > 0
      ? `(${unreadCount > 99 ? '99+' : unreadCount}) ${base}`
      : base;
}

/**
 * Names the page you are on.
 *
 * Called by the app shell from the title it already shows in the mobile
 * header, so a route names itself once and both places agree. Signed-in pages
 * are client components, and Next's `metadata` export is Server Components
 * only, so this is the way a title follows the route without restructuring
 * every page around a server wrapper.
 */
export function setPageTitle(title: string | null): void {
  pageTitle = title?.trim() || null;
  renderTitle();
}

/**
 * Puts an unread count in front of the page title.
 *
 * The one attention signal that always works: it needs no permission, and it
 * is visible from a tab the user is not looking at, which is the whole point.
 */
export function setUnreadTitle(count: number): void {
  unreadCount = Math.max(0, count);
  renderTitle();
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
