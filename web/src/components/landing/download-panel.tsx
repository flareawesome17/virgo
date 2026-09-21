'use client';

import { Apple, Check, Monitor } from 'lucide-react';
import { useHydrated } from '@/lib/hydration';
import { cn } from '@/lib/utils';

/**
 * Mirrors what GET /downloads/latest returns.
 *
 * Deliberately declared here rather than in `src/api`: that directory is
 * compared byte-for-byte against `mobile/src/api` by check-client-sync, and a
 * desktop installer listing is of no use whatsoever to the mobile app. Adding
 * it there would fail the check for everybody to describe something one client
 * will never call.
 */
export interface DownloadAsset {
  filename: string;
  platform: 'windows' | 'macos';
  arch: 'x64' | 'arm64';
  label: string;
  hint: string;
  recommended: boolean;
  size: number;
  url: string;
}

export interface LatestRelease {
  version: string;
  tag: string;
  publishedAt: string | null;
  assets: DownloadAsset[];
}

type DetectedOs = 'windows' | 'macos' | 'other' | 'unknown';

/**
 * Which operating system is asking.
 *
 * Only ever used to decide what to show *first*. Everything stays on the page
 * whatever this returns, because the cost of getting it wrong is somebody
 * downloading an installer that will not run, and the cost of being unsure is
 * one extra line of text.
 *
 * `userAgentData` where it exists — Chrome and Edge — and the user-agent string
 * elsewhere, which is all Safari and Firefox offer.
 */
function detectOs(): DetectedOs {
  if (typeof navigator === 'undefined') return 'unknown';

  const data = (
    navigator as Navigator & { userAgentData?: { platform?: string } }
  ).userAgentData;
  const platform = (data?.platform || navigator.userAgent || '').toLowerCase();

  if (platform.includes('win')) return 'windows';
  // `mac` also matches iPad's desktop-mode user agent. That is fine: it lands
  // on macOS, sees .dmg files it cannot install, and the page says as much
  // rather than pretending there is an iPad build.
  if (platform.includes('mac')) return 'macos';
  return 'other';
}

function formatSize(bytes: number): string {
  return `${Math.round(bytes / 1_048_576)} MB`;
}

function DownloadButton({
  asset,
  primary,
}: {
  asset: DownloadAsset;
  primary: boolean;
}) {
  return (
    <a
      href={asset.url}
      // The browser is being handed a file, not navigated. Without this a
      // same-origin navigation would replace the page for as long as the
      // download takes to start.
      download
      className={cn(
        'group flex min-h-11 items-center gap-3 rounded-xl px-4 py-3 transition-colors',
        primary
          ? 'bg-[#c17745] text-white shadow-lg shadow-[#c17745]/25 hover:bg-[#cd8250]'
          : 'border border-white/10 bg-white/[0.03] text-white/85 hover:bg-white/[0.06] hover:text-white',
      )}
    >
      {asset.platform === 'windows' ? (
        <Monitor className="size-5 shrink-0" aria-hidden />
      ) : (
        <Apple className="size-5 shrink-0" aria-hidden />
      )}
      <span className="flex min-w-0 flex-col text-left">
        <span className="text-[14px] font-semibold leading-tight">
          Download for {asset.label}
        </span>
        <span
          className={cn(
            'text-[12px] leading-tight',
            primary ? 'text-white/75' : 'text-white/50',
          )}
        >
          {asset.hint} · {formatSize(asset.size)}
        </span>
      </span>
    </a>
  );
}

/**
 * The download choices, ordered by what the visitor is most likely to want.
 *
 * The list itself comes from the API, which reads it from the release — so a
 * platform added to the build appears here without this file changing, and a
 * release that failed to produce an installer cannot be advertised.
 */
export function DownloadPanel({ release }: { release: LatestRelease | null }) {
  // 'unknown' until hydrated, so the server and the hydrating render agree.
  // Deciding in the server render instead would mean the HTML says Windows to
  // everybody and React replaces it, which hydration reports as a mismatch.
  const hydrated = useHydrated();
  const os: DetectedOs = hydrated ? detectOs() : 'unknown';

  if (!release || release.assets.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
        <p className="text-[15px] font-semibold text-white">
          The desktop app is not ready to download yet.
        </p>
        <p className="mt-2 text-[13px] text-white/55">
          Virgo runs in your browser and on iOS and Android in the meantime.
        </p>
      </div>
    );
  }

  const windows = release.assets.filter((a) => a.platform === 'windows');
  const macos = release.assets.filter((a) => a.platform === 'macos');

  // 'unknown' — the server's paint, before hydration — falls through to the
  // documented order rather than flashing one platform and swapping to another.
  const showWindowsFirst = os !== 'macos';

  const sections = [
    {
      key: 'windows',
      heading: 'Windows',
      detected: os === 'windows',
      assets: windows,
      note: null as string | null,
    },
    {
      key: 'macos',
      heading: 'macOS',
      detected: os === 'macos',
      assets: macos,
      // Which Mac you have cannot be told from the browser with any confidence,
      // and guessing wrong hands somebody an installer that will not open. So
      // both are offered and the question is answered instead.
      note:
        macos.length > 1
          ? 'Not sure which? Apple menu → About This Mac. “Apple M1” or later means Apple Silicon.'
          : null,
    },
  ];

  const ordered = showWindowsFirst ? sections : [...sections].reverse();

  return (
    <div className="flex flex-col gap-8">
      {ordered
        .filter((section) => section.assets.length > 0)
        .map((section) => (
          <section key={section.key} className="flex flex-col gap-3">
            <div className="flex items-center gap-2.5">
              <h2 className="text-[13px] font-bold uppercase tracking-[0.14em] text-white/45">
                {section.heading}
              </h2>
              {section.detected && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#c17745]/15 px-2 py-0.5 text-[11px] font-semibold text-[#e0a173]">
                  <Check className="size-3" aria-hidden />
                  Your system
                </span>
              )}
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2">
              {section.assets.map((asset) => (
                <DownloadButton
                  key={asset.filename}
                  asset={asset}
                  // Only the visitor's own platform gets the filled button. Two
                  // primary buttons side by side is two things shouting, and
                  // makes the choice harder rather than easier.
                  primary={section.detected && asset.recommended}
                />
              ))}
            </div>

            {section.note && (
              <p className="text-[12px] leading-relaxed text-white/45">
                {section.note}
              </p>
            )}
          </section>
        ))}
    </div>
  );
}
