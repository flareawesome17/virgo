import { router, type Href } from 'expo-router';

/**
 * Opens one of the tabs from anywhere — a pushed screen, a modal, or a
 * notification tap — by going back to the tabs that are already there.
 *
 * `router.push` (and, since React Navigation 7, `router.navigate`) to a tab
 * route from a pushed screen does not go back: it pushes a whole second copy
 * of the tabs on top of the stack. Back then returned to the old screen, and
 * every notification tap piled up another copy. `dismissTo` pops to the
 * existing tabs and hands them the tab to show, which they switch to; from a
 * tab it is a plain switch.
 *
 * For tab destinations only. A detail screen — a thread, an event, a job — is
 * still a push.
 */
export function goToTab(href: Href): void {
  router.dismissTo(href);
}

/** The routes that are tabs, by path, without groups or a query. */
const TAB_PATHS = new Set(['/', '/feed', '/jobs', '/workspaces', '/schedule', '/connect', '/settings', '/network', '/chat']);

/** Whether an in-app href is one of the tabs rather than a screen pushed over them. */
export function isTabHref(href: string): boolean {
  const path = href.split(/[?#]/)[0].replace(/\/\([^)]+\)/g, '') || '/';
  return TAB_PATHS.has(path);
}

/**
 * Opens an in-app href from anywhere: a tab is switched to (goToTab), any
 * other screen is pushed. For links whose destination is decided elsewhere —
 * a notification, an announcement — and could be either.
 */
export function openHref(href: string): void {
  if (isTabHref(href)) goToTab(href as Href);
  else router.push(href as Href);
}

/** How close together two identical pushes are one tap counted twice. */
const DOUBLE_TAP_MS = 600;
let lastPush: { key: string; at: number } | null = null;
let guarded = false;

/**
 * One screen per tap.
 *
 * A quick double tap on a row or a tile pushed the same screen twice, and
 * Back then landed on its copy. The same destination pushed again within
 * DOUBLE_TAP_MS is dropped, for every push in the app at once rather than
 * screen by screen. Anything else — another destination, a later tap — goes
 * through as before. Installed once, at startup.
 */
export function guardDoublePush(): void {
  if (guarded) return;
  guarded = true;
  const push = router.push.bind(router);
  router.push = ((href: Href, options?: unknown) => {
    const key = typeof href === 'string' ? href : JSON.stringify(href);
    const now = Date.now();
    if (lastPush && lastPush.key === key && now - lastPush.at < DOUBLE_TAP_MS) return;
    lastPush = { key, at: now };
    return (push as (h: Href, o?: unknown) => void)(href, options);
  }) as typeof router.push;
}
