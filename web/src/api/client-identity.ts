import { APP_VERSION, DESKTOP_VERSION } from '@/lib/version';

/**
 * What this client is, for the parts of the API that answer differently by
 * platform — at present, which update announcements belong in its list.
 *
 * Platform-specific by nature, so it is one of the few files under `api/` that
 * differs between web and mobile (see scripts/check-client-sync.mjs). The
 * shared code that uses it only ever calls `clientIdentity()`.
 */
export type ClientPlatform = 'web' | 'windows' | 'macos' | 'ios' | 'android';

export interface ClientIdentity {
  platform: ClientPlatform;
  /** Null on a local build, which is not a release and matches no version bound. */
  version: string | null;
}

/** Set when the web client is being staged for the desktop app. */
const IS_DESKTOP = process.env.NEXT_PUBLIC_VIRGO_DESKTOP === '1';

/**
 * The web app in a browser, or the desktop app on Windows or a Mac.
 *
 * The desktop app is this same web client inside Tauri, so it has to be told
 * apart here: a Mac-only fix must not appear in somebody's browser, and a
 * Windows installer is no news on a Mac. Its version is the one the installer
 * carries, not the web image's, since that is what the desktop user is running.
 */
export function clientIdentity(): ClientIdentity {
  if (IS_DESKTOP) {
    const agent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
    return {
      platform: /Mac/i.test(agent) ? 'macos' : 'windows',
      version: DESKTOP_VERSION,
    };
  }
  return { platform: 'web', version: APP_VERSION };
}
