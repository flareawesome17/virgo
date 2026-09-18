import type { Metadata } from 'next';
import { LandingNav } from '@/components/landing/nav';
import { LandingFooter } from '@/components/landing/closing';
import {
  DownloadPanel,
  type LatestRelease,
} from '@/components/landing/download-panel';
import { WindowsFirstRun } from '@/components/landing/windows-first-run';
import { API_BASE_URL } from '@/api';

export const metadata: Metadata = {
  title: 'Download',
  description:
    'Virgo for Windows and macOS — your shoots, albums and client delivery in a desktop app.',
};

/** How long a fetched release listing stays good for. */
const RELEASE_TTL = 300;

/**
 * Rendered per request, not at build — the same reason as the landing page.
 *
 * During `docker build` there is no route to the API, so a statically
 * generated page would bake in the "nothing to download" fallback and serve it
 * for the life of the image, including after a release that produced
 * installers.
 */
export const dynamic = 'force-dynamic';

/**
 * The newest release that actually carries installers.
 *
 * The API decides that, not this page: it reads the release, drops assets that
 * are not installers, and labels the rest. Nothing here names a filename or a
 * version, so a new platform appears the release after the build produces one
 * and this file never changes.
 *
 * Returns null rather than throwing. The API being briefly unreachable should
 * cost the download buttons — which the panel then explains — rather than
 * replacing the page with an error.
 */
async function fetchLatest(): Promise<LatestRelease | null> {
  const base = process.env.API_INTERNAL_URL || API_BASE_URL;

  try {
    const res = await fetch(`${base}/downloads/latest`, {
      next: { revalidate: RELEASE_TTL },
    });
    // 404 is the ordinary answer before the first release with installers, and
    // on a deployment with no GitHub token configured. Neither is an error
    // worth showing a visitor.
    if (!res.ok) return null;
    return (await res.json()) as LatestRelease;
  } catch {
    return null;
  }
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default async function DownloadPage() {
  const release = await fetchLatest();
  const released = formatDate(release?.publishedAt ?? null);

  return (
    <>
      {/* '/' so the section links go back to the landing page rather than to
          fragments that do not exist on this one. */}
      <LandingNav sectionBase="/" />

      {/* pt-16 clears the fixed header, which is 4rem tall and overlays the
          page rather than taking part in the flow. */}
      <main className="min-h-screen bg-[#161311] pt-16">
        <div className="mx-auto w-full max-w-3xl px-5 py-16 sm:px-8 sm:py-24">
          <header className="flex flex-col gap-4">
            <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#c17745]">
              Desktop app
            </p>
            <h1 className="text-balance text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Virgo on your desktop
            </h1>
            <p className="max-w-xl text-[15px] leading-relaxed text-white/60">
              The same workspace, in its own window. Your shoots, albums and
              client delivery, without a browser tab to lose.
            </p>
          </header>

          <div className="mt-12">
            <DownloadPanel release={release} />
          </div>

          {/* Directly under the buttons rather than at the foot of the page:
              somebody reading this has a dialog open on the other monitor and
              is looking for the words they just saw. Windows only: the Mac
              builds are signed and notarised, so macOS opens them without
              asking. */}
          <WindowsFirstRun />

          {release && (
            <p className="mt-10 border-t border-white/8 pt-6 text-[12px] text-white/40">
              Version {release.version}
              {released && ` · released ${released}`}
            </p>
          )}

          {/* Named on the page rather than left to the installer to reveal.
              Somebody on Windows 8 or an old Mac should find that out before a
              100 MB download, not after it. */}
          <p className="mt-3 text-[12px] leading-relaxed text-white/35">
            Windows 10 and 11, or macOS 10.15 and later. Virgo also runs in any
            modern browser, and on iOS and Android.
          </p>
        </div>
      </main>

      <LandingFooter />
    </>
  );
}
