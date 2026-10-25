/**
 * What a signed-in session is, in words its owner recognises.
 *
 * Used twice: in the email sent when a new device signs in, and in the
 * Devices list in Settings. Both have to name the same session the same way,
 * or "the iPhone app the email warned you about" is not findable in the list
 * that signs it out.
 */

/** Which Virgo client a session signed in from. Mirrors refresh_tokens.client. */
export type SessionClient = 'ios' | 'android' | 'desktop' | 'web';

/**
 * The desktop app's origin. Its webview is WebView2 (Edge) on Windows and
 * WebKit on a Mac, so the User-Agent alone reads as a browser; the loopback
 * origin it serves the app from is what gives it away. Fixed for the same
 * reason the API's CORS list names it (desktop/README.md).
 */
const DESKTOP_ORIGINS = new Set(['http://127.0.0.1:41730']);

/**
 * Works out the client from what every request already carries.
 *
 * The phone apps sign in through the platform's own HTTP stack, not a
 * browser: CFNetwork on iPhone and iPad, okhttp on Android, and neither sends
 * an Origin. Null when nothing fits, rather than a guess.
 */
export function sessionClient(
  userAgent: string | null | undefined,
  origin?: string | null,
): SessionClient | null {
  if (origin && DESKTOP_ORIGINS.has(origin)) return 'desktop';
  const ua = userAgent ?? '';
  if (!/Mozilla/.test(ua)) {
    if (/CFNetwork|Darwin/.test(ua)) return 'ios';
    if (/okhttp/i.test(ua)) return 'android';
    return null;
  }
  return 'web';
}

function browserOf(ua: string): string {
  if (/Edg\//.test(ua)) return 'Edge';
  if (/OPR\/|Opera/.test(ua)) return 'Opera';
  if (/Firefox\/|FxiOS\//.test(ua)) return 'Firefox';
  if (/Chrome\/|CriOS\//.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua)) return 'Safari';
  return 'A browser';
}

function systemOf(ua: string): string | null {
  if (/iPhone|iPod/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Mac OS X|Macintosh/.test(ua)) return 'Mac';
  if (/CrOS/.test(ua)) return 'Chromebook';
  if (/Linux/.test(ua)) return 'Linux';
  return null;
}

export interface DeviceLabel {
  /** The machine: "iPhone or iPad", "Windows", "Android phone". */
  device: string;
  /** How it got in: "Virgo app", "Virgo desktop app", "Chrome, on the web". */
  app: string;
}

/**
 * Deliberately coarse, like the console's: versions change monthly, and
 * nobody decides whether a session is theirs by its minor version. An iPhone
 * and an iPad send the same User-Agent from the app, so it says both.
 */
export function describeDevice(
  userAgent: string | null | undefined,
  client: SessionClient | null | undefined,
): DeviceLabel {
  const ua = userAgent ?? '';
  const kind = client ?? sessionClient(ua);

  switch (kind) {
    case 'ios':
      return { device: 'iPhone or iPad', app: 'Virgo app' };
    case 'android':
      return { device: 'Android phone', app: 'Virgo app' };
    case 'desktop':
      return { device: systemOf(ua) ?? 'Computer', app: 'Virgo desktop app' };
    case 'web':
      return { device: systemOf(ua) ?? 'Computer', app: `${browserOf(ua)}, on the web` };
    default:
      return { device: 'Unknown device', app: 'Signed in to Virgo' };
  }
}
