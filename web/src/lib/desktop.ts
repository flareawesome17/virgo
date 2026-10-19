/**
 * The desktop shell, as the web app sees it.
 *
 * Nothing here does anything on the web: `NEXT_PUBLIC_VIRGO_DESKTOP` is set
 * only by `desktop/scripts/stage-web.mjs`, and the globals below exist only
 * inside the shell, which sets `withGlobalTauri`.
 *
 * The API is declared rather than imported, as the title bar does it:
 * `@tauri-apps/api` is a dependency of the shell, not of `web/`, and adding it
 * here would ship it to every browser for calls that only work inside the app.
 *
 * Every call can fail even in the app. A command the shell has not granted is
 * refused, and setting a badge is not supported on Windows at all, so callers
 * catch every promise rather than trusting that the method being there means
 * it works.
 */

export const IS_DESKTOP = process.env.NEXT_PUBLIC_VIRGO_DESKTOP === '1';
export const IS_WINDOWS = process.env.NEXT_PUBLIC_DESKTOP_OS === 'windows';

/**
 * Tauri's `UserAttentionType.Informational`: the taskbar button flashes until
 * the window is brought forward on Windows, and the dock icon bounces once on
 * macOS. `Critical` (1) bounces until the app is opened, which is for things
 * that cannot wait; a new message can.
 */
export const ATTENTION_INFORMATIONAL = 2;

/** What a close-requested listener is handed. */
export interface CloseRequest {
  /** Keeps the window open; without it the shell's wrapper destroys it. */
  preventDefault(): void;
}

/**
 * The window commands the page uses.
 *
 * `onCloseRequested` is the one to be careful with. While any listener is
 * registered, the shell holds every close — the X, Alt+F4, the red button,
 * the taskbar — until the page answers, so it is registered only while there
 * is something to ask about, and always taken off again.
 */
export interface DesktopWindow {
  setTitle(title: string): Promise<void>;
  setBadgeCount(count?: number): Promise<void>;
  requestUserAttention(type: number | null): Promise<void>;
  isFocused(): Promise<boolean>;
  unminimize(): Promise<void>;
  setFocus(): Promise<void>;
  /** Resolves to the unlisten function, which is itself asynchronous. */
  onCloseRequested(handler: (event: CloseRequest) => void): Promise<() => void | Promise<void>>;
  destroy(): Promise<void>;
  close(): Promise<void>;
}

interface OpenerPlugin {
  revealItemInDir?: (path: string) => Promise<void>;
}

interface TauriGlobal {
  window?: { getCurrentWindow?: () => DesktopWindow };
  opener?: OpenerPlugin;
}

type DesktopGlobals = {
  __TAURI__?: TauriGlobal;
  __TAURI_PLUGIN_OPENER__?: OpenerPlugin;
};

function globals(): DesktopGlobals | null {
  if (!IS_DESKTOP || typeof window === 'undefined') return null;
  return window as unknown as DesktopGlobals;
}

/** The app's window, or null on the web and before the bridge is there. */
export function desktopWindow(): DesktopWindow | null {
  return globals()?.__TAURI__?.window?.getCurrentWindow?.() ?? null;
}

/** Opens the folder holding `path` in Explorer or the Finder, with it selected. */
export function revealInFolder(path: string): Promise<void> {
  const g = globals();
  // The plugin hangs itself off `__TAURI__` and also leaves its own global;
  // openExternal in the bell reads the second, so either is accepted.
  const reveal = g?.__TAURI__?.opener?.revealItemInDir ?? g?.__TAURI_PLUGIN_OPENER__?.revealItemInDir;
  if (!reveal) return Promise.reject(new Error('The desktop bridge is unavailable.'));
  return reveal(path);
}

/** The fragment the shell looks for before it lets a link load in the window. */
const DOWNLOAD_MARK = 'virgo-download';

/**
 * A download link the desktop app will save rather than send to the browser.
 *
 * The shell decides what to do with a navigation before the response arrives,
 * so it cannot see `Content-Disposition: attachment`. Every address outside
 * the app now opens in the system browser, and the only exception is one whose
 * fragment is exactly the mark — which is how the page says "this one is a
 * file". A fragment never reaches the server, so the signed query is left
 * exactly as it was signed.
 *
 * Edited as a string, not through `new URL`, which re-serialises the query and
 * could re-encode a character the signature covers. On the web the link is
 * returned untouched.
 */
export function downloadHref(url: string): string {
  if (!IS_DESKTOP) return url;
  const hash = url.indexOf('#');
  return `${hash === -1 ? url : url.slice(0, hash)}#${DOWNLOAD_MARK}`;
}
