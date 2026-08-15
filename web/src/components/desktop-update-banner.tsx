'use client';

import { useEffect, useState } from 'react';
import { ArrowDownToLine, X } from 'lucide-react';
import { API_BASE_URL } from '@/api';

/**
 * Tells the desktop app when a newer version has been released.
 *
 * The desktop app has no auto-updater. It runs the web client, so every change
 * to the product reaches it the moment the server is deployed — the installer
 * only ever needs replacing when the shell itself changes, which is rare. What
 * it cannot do on its own is notice that it has been superseded, and a desktop
 * app that quietly rots is worse than one that says so.
 *
 * Nothing here runs on the web. `NEXT_PUBLIC_VIRGO_DESKTOP` is set only by
 * `desktop/scripts/stage-web.mjs`, so this component compiles to a `null`
 * return in the image that serves web.virgo.ph.
 */

/** What GET /downloads/latest returns, narrowed to what this needs. */
interface LatestAsset {
  platform: 'windows' | 'macos';
  arch: 'x64' | 'arm64';
  label: string;
  recommended: boolean;
  url: string;
}

interface LatestRelease {
  version: string;
  assets: LatestAsset[];
}

/**
 * Whether this build is the desktop app.
 *
 * Baked in at build time rather than probed for at runtime. The obvious probe —
 * looking for `window.__TAURI__` — does not work: Tauri only injects its API
 * into pages it serves itself, and the desktop app loads the web client from
 * http://127.0.0.1:41730, which is a remote origin as far as the webview is
 * concerned. Nothing on the page can tell it apart from a browser tab.
 */
const IS_DESKTOP = process.env.NEXT_PUBLIC_VIRGO_DESKTOP === '1';

/** The version of the installer this bundle was staged into. */
const CURRENT_VERSION = process.env.NEXT_PUBLIC_DESKTOP_VERSION ?? '';

const DISMISS_KEY = 'virgo.desktop.updateDismissed';

/**
 * `a` is newer than `b`.
 *
 * Compares numerically per part, so 1.10.0 is correctly newer than 1.9.0 —
 * which a string comparison gets backwards, and which is exactly the release
 * where somebody would notice.
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

/** Same detection as the download page, and for the same reason. */
function detectPlatform(): 'windows' | 'macos' | null {
  if (typeof navigator === 'undefined') return null;
  const data = (
    navigator as Navigator & { userAgentData?: { platform?: string } }
  ).userAgentData;
  const platform = (data?.platform || navigator.userAgent || '').toLowerCase();
  if (platform.includes('win')) return 'windows';
  if (platform.includes('mac')) return 'macos';
  return null;
}

export function DesktopUpdateBanner() {
  const [release, setRelease] = useState<LatestRelease | null>(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    // Compiled away on the web build, and skipped when the staged bundle has
    // no version to compare against — a local `npm run stage` before any
    // release has one, and "update available" against nothing is noise.
    if (!IS_DESKTOP || !CURRENT_VERSION) return;

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/downloads/latest`);
        if (!res.ok) return;
        const latest = (await res.json()) as LatestRelease;
        if (cancelled) return;
        if (!isNewer(latest.version, CURRENT_VERSION)) return;

        // Dismissal is remembered per version, so saying "not now" to 1.8.0
        // does not also silence 1.9.0.
        const silenced =
          typeof localStorage !== 'undefined' &&
          localStorage.getItem(DISMISS_KEY) === latest.version;

        setRelease(latest);
        setDismissed(silenced);
      } catch {
        // An update notice is the least important thing on the page. If the
        // API is unreachable the app itself is already broken and saying so is
        // the app's job, not this banner's.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!release || dismissed) return null;

  const platform = detectPlatform();
  const installer =
    release.assets.find((a) => a.platform === platform && a.recommended) ??
    release.assets.find((a) => a.platform === platform);

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, release.version);
    } catch {
      // Private browsing, or storage full. Dismissing for this session only is
      // a perfectly good outcome; failing to dismiss is not.
    }
  };

  return (
    <div className="flex items-center gap-3 border-b bg-primary/5 px-4 py-2.5">
      <ArrowDownToLine className="size-4 shrink-0 text-primary" aria-hidden />

      <p className="min-w-0 flex-1 text-sm">
        <span className="font-medium">Virgo {release.version} is available.</span>{' '}
        <span className="text-muted-foreground">
          You have {CURRENT_VERSION}.
        </span>
      </p>

      {installer ? (
        <a
          href={installer.url}
          // Hands the file to the webview's own download handling rather than
          // navigating. Without it the app window would leave the app to fetch
          // a 100 MB file and have nowhere to come back to.
          download
          className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          Update
        </a>
      ) : (
        // No installer for this platform in that release — rare, and it means
        // the build failed on one runner rather than that there is no update.
        // Pointing at the page is still better than a button that downloads
        // the wrong thing.
        <a
          href="https://virgo.ph/download"
          className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          Get it
        </a>
      )}

      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss until the next version"
        className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
