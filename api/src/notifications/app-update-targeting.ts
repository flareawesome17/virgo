/**
 * Who an update announcement is for.
 *
 * Pure, and kept apart from the service so the rules can be tested without a
 * database: these are the functions that decide whether a Mac is told about a
 * Windows fix, or a phone on 1.3.3 is promised an update that only 1.3.4 will
 * receive. Getting them wrong does not fail loudly — it just tells people
 * things that are not true about their own app.
 */

/**
 * Everything a client can be. `windows` and `macos` are the desktop app;
 * the phone app on either platform is `ios` or `android`.
 */
export const CLIENT_PLATFORMS = ['web', 'windows', 'macos', 'ios', 'android'] as const;
export type ClientPlatform = (typeof CLIENT_PLATFORMS)[number];

/** The phone platforms — the ones an announcement can also be pushed to. */
export const MOBILE_PLATFORMS: readonly ClientPlatform[] = ['ios', 'android'];

/** What a client says it is. Version is null when the build does not know. */
export interface Client {
  platform: ClientPlatform;
  version: string | null;
}

/** The targeting half of an announcement. */
export interface Target {
  platforms: readonly string[];
  minVersion: string | null;
  maxVersion: string | null;
}

/**
 * A version as `1.12.9`, or null if it is not one.
 *
 * The web image is stamped with the tag (`v1.12.9`) and everything else with
 * the bare number, so a leading `v` is dropped. Anything that is not up to four
 * dot-separated numbers is refused rather than guessed at: a build that
 * reports `dev` or `1.3.4-beta` must not be matched against a bound as if it
 * were a release.
 */
export function normalizeVersion(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().replace(/^v/i, '');
  return /^\d{1,6}(\.\d{1,6}){0,3}$/.test(trimmed) ? trimmed : null;
}

/**
 * Negative, zero or positive as `a` is older than, the same as, or newer than
 * `b`, numerically per part.
 *
 * `1.10.0` is newer than `1.9.0`, which a string comparison gets backwards —
 * and that is exactly the release where it would matter. Missing parts count
 * as zero, so `1.3` equals `1.3.0`.
 */
export function compareVersions(a: string, b: string): number {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const diff = (x[i] ?? 0) - (y[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * What a client said about itself, or null if it said nothing usable.
 *
 * Null means "show no announcements", not "show all of them". A client too old
 * to report its platform cannot be targeted, and guessing would put an iPhone
 * announcement in somebody's web browser. Such a client still gets every
 * ordinary notification; it just misses these.
 */
export function parseClient(
  platform: string | null | undefined,
  version: string | null | undefined,
): Client | null {
  if (!platform || !(CLIENT_PLATFORMS as readonly string[]).includes(platform)) {
    return null;
  }
  return { platform: platform as ClientPlatform, version: normalizeVersion(version) };
}

/**
 * Whether an announcement is for this client.
 *
 * Platform must be one of the targets. Version bounds are inclusive and each is
 * optional. A client that reports no version sees only announcements with no
 * bounds at all: a bound exists precisely because the update does not apply
 * everywhere, so an unknown version is treated as not matching rather than as
 * matching everything.
 */
export function appliesTo(target: Target, client: Client): boolean {
  if (!target.platforms.includes(client.platform)) return false;

  const min = normalizeVersion(target.minVersion);
  const max = normalizeVersion(target.maxVersion);
  if (!min && !max) return true;
  if (!client.version) return false;

  if (min && compareVersions(client.version, min) < 0) return false;
  if (max && compareVersions(client.version, max) > 0) return false;
  return true;
}
