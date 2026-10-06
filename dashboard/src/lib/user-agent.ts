/**
 * "Chrome on Windows" from a user-agent string — what a person recognises in a
 * list of sessions. Deliberately coarse: versions change monthly and nobody
 * decides whether a session is theirs by its minor version.
 */
export function describeAgent(ua: string | null | undefined): string {
  if (!ua) return 'Unknown device';
  // The Virgo apps sign in through the platform's own HTTP stack, not a
  // browser: CFNetwork on iPhone and iPad, okhttp on Android.
  if (!/Mozilla/.test(ua)) {
    if (/CFNetwork|Darwin/.test(ua)) return 'iPhone app';
    if (/okhttp/i.test(ua)) return 'Android app';
  }
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\/|CriOS\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'A browser';
  const os = /iPhone|iPad|iPod/.test(ua)
    ? 'iPhone'
    : /Android/.test(ua)
      ? 'Android'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : null;
  return os ? `${browser} on ${os}` : browser;
}
