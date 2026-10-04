import type { Metadata } from 'next';
import { StoryFooter } from '@/components/story/page/chapters/footer';
import { TitleBar } from '@/components/story/page/cinema/title-bar';
import { PrePaint } from '@/components/story/page/pre-paint';
import { DownloadStage } from '@/components/story/download/download-stage';
import { MEDIA } from '@/components/story/media.generated';
import '@/components/story/page/story.css';
import {
  DownloadPanel,
  type LatestRelease,
} from '@/components/landing/download-panel';
import { WindowsFirstRun } from '@/components/landing/windows-first-run';
import {
  AndroidDownload,
  type AndroidBuild,
} from '@/components/landing/android-download';
import { API_BASE_URL } from '@/api';

export const metadata: Metadata = {
  title: 'Download',
  description:
    'Virgo for Windows, macOS and Android — your shoots, albums and client delivery, in an app.',
};

/** How long a fetched release listing stays good for. */
const RELEASE_TTL = 300;

/**
 * How long to wait for the API before rendering without it. Both reads fail
 * soft (the panel explains, the Android section hides), so a slow or
 * unreachable API costs the buttons for one render, never the page itself.
 */
const API_TIMEOUT = 5_000;

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
      signal: AbortSignal.timeout(API_TIMEOUT),
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

/**
 * The Android APK, from its own release.
 *
 * A second request rather than a field on the one above, because the two
 * describe different products on different version lines. Failing softly for
 * the same reason: no APK should cost the Android section, not the page.
 */
async function fetchAndroid(): Promise<AndroidBuild | null> {
  const base = process.env.API_INTERNAL_URL || API_BASE_URL;

  try {
    const res = await fetch(`${base}/downloads/android`, {
      next: { revalidate: RELEASE_TTL },
      signal: AbortSignal.timeout(API_TIMEOUT),
    });
    if (!res.ok) return null;
    // The endpoint answers `null` until a mobile release exists, which parses
    // to null rather than to an object with empty fields.
    return (await res.json()) as AndroidBuild | null;
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

/** The letterbox bars, as on the story: they open as the page arrives (desktop, motion only). */
const BAR = 'story-bars pointer-events-none fixed inset-x-0 z-[45] h-[min(11vh,max(0px,calc((100vh_-_100vw/2.39)/2)))] bg-[#090807]';

/**
 * The download page, in the story's film grammar (05-cinema.md): a title card
 * that opens on letterbox bars and a light sweep, the app hanging in 3D in a
 * warm key light with the tools of the trade around it, and the downloads as
 * lit cards with the visitor's own system first. No header: the mark goes back
 * to the story, and Sign in sits opposite it.
 */
export default async function DownloadPage() {
  // Together: two independent reads of the same API, and waiting for one
  // before starting the other would double the page's time to first byte for
  // no reason.
  const [release, android] = await Promise.all([fetchLatest(), fetchAndroid()]);
  const released = formatDate(release?.publishedAt ?? null);

  return (
    <div className="story-page relative isolate min-h-svh bg-[#161311] text-[#F2EDE8] [overflow-x:clip]">
      <PrePaint />
      <TitleBar home="/" homeLabel="Virgo, back to the story" />
      <div aria-hidden className={`${BAR} top-0 origin-top`} />
      <div aria-hidden className={`${BAR} bottom-0 origin-bottom`} />

      <main>
        <section aria-labelledby="download-title" className="relative overflow-clip">
          {/* The sky from the story, low behind the title, settling into the night. */}
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[110svh]">
            <picture>
              <source media="(min-width: 768px)" type={MEDIA.posterDesktopAvif.type} srcSet={MEDIA.posterDesktopAvif.url} />
              <source media="(min-width: 768px)" type={MEDIA.posterDesktopWebp.type} srcSet={MEDIA.posterDesktopWebp.url} />
              <source type={MEDIA.posterMobileAvif.type} srcSet={MEDIA.posterMobileAvif.url} />
              <img src={MEDIA.posterMobileWebp.url} alt="" decoding="async" className="size-full object-cover opacity-45" />
            </picture>
            <div className="absolute inset-0 bg-[radial-gradient(70%_60%_at_30%_40%,rgba(22,19,17,0.55),rgba(22,19,17,0.9)_70%)]" />
            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-b from-transparent to-[#161311]" />
          </div>
          {/* One light sweep across the title card as it opens. */}
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="story-sweep absolute -inset-y-1/2 left-0 w-[40%] bg-[linear-gradient(90deg,rgba(240,200,142,0),rgba(240,200,142,0.22),rgba(255,231,194,0.4),rgba(240,200,142,0.22),rgba(240,200,142,0))]" />
          </div>

          <div className="relative mx-auto grid max-w-6xl gap-16 px-5 pb-24 pt-28 sm:px-8 lg:min-h-svh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center lg:gap-12 lg:pt-32">
            <div className="min-w-0">
              <p className="font-mono text-[11px] uppercase tracking-[0.32em] text-[#D18A5A] sm:text-xs">Download</p>
              <h1
                id="download-title"
                className="mt-5 text-balance text-[clamp(2.4rem,1.3rem+3.6vw,4.25rem)] font-semibold leading-[1] tracking-[-0.035em]"
              >
                <span className="block font-medium text-[#BCADA3]">Virgo, on every</span>{' '}
                <span className="block bg-gradient-to-r from-[#e8b189] via-[#c17745] to-[#a85f38] bg-clip-text text-transparent">
                  screen you work from.
                </span>
              </h1>
              <p className="mt-6 max-w-[44ch] text-pretty text-[1.0625rem] leading-[1.55] text-[#BCADA3] sm:text-lg">
                The same workspace on Windows, macOS and Android: your crew, your albums, your client links.
              </p>

              <div className="mt-10">
                <DownloadPanel release={release} />
              </div>

              {/* Directly under the buttons rather than at the foot of the page:
                  somebody reading this has a dialog open on the other monitor and
                  is looking for the words they just saw. Windows only: the Mac
                  builds are signed and notarised, so macOS opens them without
                  asking. */}
              <WindowsFirstRun />
            </div>

            <div className="order-last px-3 pb-10 sm:px-8 lg:order-none lg:px-0">
              <DownloadStage />
            </div>
          </div>
        </section>

        <section aria-label="More ways to get Virgo" className="mx-auto max-w-6xl px-5 pb-24 sm:px-8">
          <div className="max-w-2xl">
            {/* After the desktop installers and the Windows note, not between
                them: those two are one thought, and the phone app is a different
                one that should not interrupt it. */}
            <AndroidDownload build={android} />

            {release && (
              <p className="mt-10 border-t border-[#2A2522] pt-6 font-mono text-[11px] uppercase tracking-[0.16em] text-[#A08E84]">
                {/* Named as the desktop version now that an Android build with
                    its own number sits above it. Unqualified, this line read as
                    the version of everything on the page. */}
                Desktop version {release.version}
                {released && ` · released ${released}`}
              </p>
            )}

            {/* Named on the page rather than left to the installer to reveal.
                Somebody on Windows 8 or an old Mac should find that out before a
                100 MB download, not after it. */}
            <p className="mt-3 text-[13px] leading-relaxed text-[#A08E84]">
              Windows 10 and 11, or macOS 10.15 and later. Virgo also runs in any modern browser, and the iPhone app is coming to the App
              Store soon.
            </p>
          </div>
        </section>
      </main>

      <StoryFooter sectionBase="/" credits={false} />
      <div aria-hidden className="story-grain" style={{ backgroundImage: `url(${MEDIA.grain.url})` }} />
    </div>
  );
}
