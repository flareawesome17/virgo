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
    <section className="flex flex-col gap-3 border-t border-[#2A2522] pt-10">
      <div className="flex items-baseline gap-2.5">
        <h2 className="font-mono text-[11px] font-normal uppercase tracking-[0.2em] text-[#A08E84]">
          Android
        </h2>
        <span className="font-mono text-[11px] text-[#A08E84]/80">{build.version}</span>
      </div>

      <a
        href={build.url}
        download
        className="group flex min-h-14 w-full items-center gap-3.5 rounded-2xl border border-[#2A2522] bg-[linear-gradient(165deg,#211C19,#1A1614)] px-4 py-3.5 text-[#F2EDE8] shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_18px_40px_-28px_rgba(0,0,0,0.9)] transition-[border-color,transform] duration-300 hover:-translate-y-0.5 hover:border-[#D18A5A]/50 focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[#F2EDE8] motion-reduce:hover:translate-y-0 sm:w-[calc(50%-0.3125rem)]"
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[radial-gradient(120%_120%_at_30%_20%,#3A2F28,#1A1513_70%)] text-[#F0C88E] shadow-[inset_0_1px_0_rgba(240,200,142,0.35),inset_0_0_0_1px_rgba(209,138,90,0.28)]">
          <Smartphone className="size-5" aria-hidden />
        </span>
        <span className="flex min-w-0 flex-col text-left">
          <span className="text-[15px] font-semibold leading-tight">
            Download the APK
          </span>
          <span className="mt-0.5 text-[12.5px] leading-tight text-[#A08E84]">
            Android 8 and later · {formatSize(build.size)}
          </span>
        </span>
      </a>

      {/* Said before the download rather than left to Android to raise mid-
          install. Being warned by the phone that a file is unusual, with no
          warning from the people who made it, is what a careful person backs
          out of — and they would be right to. */}
      <p className="max-w-xl text-[13px] leading-relaxed text-[#A08E84]">
        Virgo is not on Google Play yet, so this installs from the file itself.
        Android will ask whether to allow installs from your browser the first
        time; that permission is per-app and you can turn it off afterwards.
      </p>
    </section>
  );
}
