import { Smartphone } from 'lucide-react';

/**
 * Mirrors what GET /downloads/android returns.
 *
 * Declared here beside the desktop listing's type and for the same reason:
 * `src/api` is compared byte-for-byte against `mobile/src/api`, and the phone
 * app has no use for a link to its own APK.
 */
export interface AndroidBuild {
  version: string;
  tag: string;
  filename: string;
  size: number;
  url: string;
  publishedAt: string | null;
}

function formatSize(bytes: number): string {
  return `${Math.round(bytes / 1_048_576)} MB`;
}

/**
 * The Android app as a file, because there is no Play Store listing yet.
 *
 * Set apart from the desktop installers above rather than folded in as a third
 * platform: those are the desktop release, captioned with the desktop version,
 * and this is a different product on a different version line. Putting them in
 * one list would make that caption a lie about one of them.
 *
 * Renders nothing at all when there is no mobile release. An empty heading
 * saying "no Android download" is worse than the absence — somebody reading
 * this page for the desktop app does not need to be told what it lacks.
 */
export function AndroidDownload({ build }: { build: AndroidBuild | null }) {
  if (!build) return null;

  return (
    <section className="mt-10 flex flex-col gap-3 border-t border-white/8 pt-8">
      <div className="flex items-baseline gap-2.5">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.14em] text-white/45">
          Android
        </h2>
        <span className="text-[12px] text-white/35">{build.version}</span>
      </div>

      <a
        href={build.url}
        download
        className="group flex min-h-11 w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-white/85 transition-colors hover:bg-white/[0.06] hover:text-white sm:w-[calc(50%-0.3125rem)]"
      >
        <Smartphone className="size-5 shrink-0" aria-hidden />
        <span className="flex min-w-0 flex-col text-left">
          <span className="text-[14px] font-semibold leading-tight">
            Download the APK
          </span>
          <span className="text-[12px] leading-tight text-white/50">
            Android 8 and later · {formatSize(build.size)}
          </span>
        </span>
      </a>

      {/* Said before the download rather than left to Android to raise mid-
          install. Being warned by the phone that a file is unusual, with no
          warning from the people who made it, is what a careful person backs
          out of — and they would be right to. */}
      <p className="max-w-xl text-[12px] leading-relaxed text-white/45">
        Virgo is not on Google Play yet, so this installs from the file itself.
        Android will ask whether to allow installs from your browser the first
        time; that permission is per-app and you can turn it off afterwards.
      </p>
    </section>
  );
}
