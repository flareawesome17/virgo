'use client';

import { Apple, Check, Monitor } from 'lucide-react';
import { useHydrated } from '@/lib/hydration';
import { cn } from '@/lib/utils';
import { APP_URL } from './links';

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[#F2EDE8]';

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
        'group relative flex min-h-14 items-center gap-3.5 overflow-hidden rounded-2xl px-4 py-3.5 transition-[background-color,border-color,transform] duration-300 hover:-translate-y-0.5 motion-reduce:transition-colors motion-reduce:hover:translate-y-0',
        FOCUS,
        primary
          ? 'bg-[#D18A5A] text-[#161311] shadow-[0_18px_44px_-18px_rgba(209,138,90,0.85),inset_0_1px_0_rgba(255,255,255,0.25)] hover:bg-[#dc9a6c]'
          : 'border border-[#2A2522] bg-[linear-gradient(165deg,#211C19,#1A1614)] text-[#F2EDE8] shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_18px_40px_-28px_rgba(0,0,0,0.9)] hover:border-[#D18A5A]/50',
      )}
    >
      {/* The primary button catches the light as the pointer crosses it. */}
      {primary && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/4 -skew-x-12 bg-white/30 opacity-0 transition-[transform,opacity] duration-700 group-hover:translate-x-[520%] group-hover:opacity-100 motion-reduce:hidden"
        />
      )}
      <span
        className={cn(
          'grid size-10 shrink-0 place-items-center rounded-xl',
          primary
            ? 'bg-[#161311]/15'
            : 'bg-[radial-gradient(120%_120%_at_30%_20%,#3A2F28,#1A1513_70%)] text-[#F0C88E] shadow-[inset_0_1px_0_rgba(240,200,142,0.35),inset_0_0_0_1px_rgba(209,138,90,0.28)]',
        )}
      >
        {asset.platform === 'windows' ? (
          <Monitor className="size-5" aria-hidden />
        ) : (
          <Apple className="size-5" aria-hidden />
        )}
      </span>
      <span className="relative flex min-w-0 flex-col text-left">
        <span className="text-[15px] font-semibold leading-tight">
          Download for {asset.label}
        </span>
        <span
          className={cn(
            'mt-0.5 text-[12.5px] leading-tight',
            primary ? 'text-[#161311]/70' : 'text-[#A08E84]',
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
      <div className="rounded-[20px] border border-[#2A2522] bg-[linear-gradient(165deg,#211C19,#1A1614)] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <p className="text-[16px] font-semibold text-[#F2EDE8]">
          The desktop app is not ready to download yet.
        </p>
        <p className="mt-2 text-[14px] text-[#A08E84]">
          Virgo runs in your browser in the meantime.
        </p>
        <a
          href={APP_URL}
          className={cn(
            'mt-5 inline-flex min-h-11 items-center rounded-full bg-[#D18A5A] px-5 text-[15px] font-semibold text-[#161311] transition-colors hover:bg-[#dc9a6c]',
            FOCUS,
          )}
        >
          Open Virgo in your browser
        </a>
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
              <h2 className="font-mono text-[11px] font-normal uppercase tracking-[0.2em] text-[#A08E84]">
                {section.heading}
              </h2>
              {section.detected && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#D18A5A]/15 px-2 py-0.5 text-[11px] font-semibold text-[#F0C88E]">
                  <Check className="size-3" aria-hidden />
                  Your system
                </span>
              )}
            </div>

            <div className={cn('grid gap-2.5', section.assets.length > 1 && 'sm:grid-cols-2')}>
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
              <p className="text-[12.5px] leading-relaxed text-[#A08E84]">
                {section.note}
              </p>
            )}
          </section>
        ))}
    </div>
  );
}
