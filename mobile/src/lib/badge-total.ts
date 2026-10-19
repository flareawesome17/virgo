/**
 * The number on the app's home-screen icon: unread messages plus unread
 * notifications — the Messages dot and the bell, the two counts the app shows.
 * The server puts the same sum on each push (PushService.badgeCounts).
 *
 * Null until both are known. Drawing 0 for a count still loading would clear
 * the number a push had just put on the icon, every time the app started.
 *
 * Pure, and in a file of its own, so it can be tested without React Native.
 */
export function appBadgeTotal(
  messages: number | undefined,
  notifications: number | undefined,
): number | null {
  if (messages === undefined || notifications === undefined) return null;
  return whole(messages) + whole(notifications);
}

function whole(n: number): number {
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}
