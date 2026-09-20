import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '@/src/api';

/**
 * Telling somebody a new build is waiting.
 *
 * Distinct from `ota-updates.ts`, which handles the updates that arrive on
 * their own. Those are JavaScript, and they land without anyone being asked.
 * This is the other kind: a change to native code — a new dependency, a config
 * plugin, anything that moves the fingerprint — which expo-updates will not
 * deliver over the air and which needs a new binary from TestFlight, the App
 * Store or the APK.
 *
 * Nothing in the app said so. An update would sit in TestFlight unmentioned
 * while the installed copy carried on looking current, and the only way to
 * find out was to go and look. That is what this fixes.
 */

/** Where the newest published mobile version is announced. */
const ENDPOINT = '/downloads/mobile';

/** The app is not checking this on every screen mount. */
const CHECK_EVERY_MS = 6 * 60 * 60_000;

const DISMISSED_KEY = 'virgo.update.dismissed.v1';
const LAST_CHECK_KEY = 'virgo.update.lastCheck.v1';

export interface AvailableUpdate {
  /** The version published, e.g. "1.3.2". */
  version: string;
  /** What this build is, for the line under the message. */
  installed: string;
}

/**
 * `a` is newer than `b`, compared numerically per part.
 *
 * 1.10.0 is newer than 1.9.0, which a string comparison gets backwards — and
 * that is exactly the release where it would matter, because every installed
 * copy would decide it was already current and stop offering the update.
 */
function isNewer(a: string, b: string): boolean {
  const parse = (v: string) => v.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const diff = (x[i] ?? 0) - (y[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

/** This build's own version, from the config the binary was built with. */
export function installedVersion(): string {
  return Constants.expoConfig?.version ?? '0.0.0';
}

/**
 * Whether a newer build has been published, or null.
 *
 * Every failure answers null. A version check is the least important request
 * the app makes, and an account with no connection should see nothing rather
 * than an error about something they did not ask for.
 */
export async function checkForNewBuild(): Promise<AvailableUpdate | null> {
  const installed = installedVersion();

  try {
    const last = Number(await AsyncStorage.getItem(LAST_CHECK_KEY)) || 0;
    if (Date.now() - last < CHECK_EVERY_MS) return null;

    const response = await fetch(`${API_BASE_URL}${ENDPOINT}`);
    if (!response.ok) return null;

    // The endpoint answers `null` until a mobile release exists, which parses
    // to null rather than to an object with empty fields.
    const latest = (await response.json()) as { version?: string } | null;
    await AsyncStorage.setItem(LAST_CHECK_KEY, String(Date.now()));

    if (!latest?.version || !isNewer(latest.version, installed)) return null;

    // Dismissing is per version, not forever: saying "not now" to 1.3.2 should
    // not also dismiss 1.4.0 six weeks later.
    const dismissed = await AsyncStorage.getItem(DISMISSED_KEY);
    if (dismissed === latest.version) return null;

    return { version: latest.version, installed };
  } catch {
    return null;
  }
}

/** Remembers that this version's notice was dismissed. */
export async function dismissUpdate(version: string): Promise<void> {
  try {
    await AsyncStorage.setItem(DISMISSED_KEY, version);
  } catch {
    // A dismissal that fails to save means the notice returns. Mildly
    // annoying, and better than failing the tap.
  }
}

/**
 * Where to send somebody to get the new build.
 *
 * iOS goes to the App Store listing. A TestFlight build cannot be linked to
 * directly — Apple gives no URL scheme for "open this app in TestFlight" —
 * so a tester is told where to look rather than sent somewhere that will not
 * work. Android goes to the page that serves the APK, because there is no
 * Play Store listing yet.
 */
export function updateDestination(): { url: string; label: string } {
  if (Platform.OS === 'ios') {
    return {
      url: 'https://apps.apple.com/app/id6813545420',
      label: 'Open the App Store',
    };
  }
  return { url: 'https://virgo.ph/download', label: 'Download the update' };
}
