import { ShieldAlert } from 'lucide-react';

/**
 * What to do when macOS refuses to open the app.
 *
 * The desktop builds are not signed with an Apple Developer ID yet, so macOS
 * cannot check who made them and stops the first launch. Two different dialogs
 * come out of that one fact, and they need different answers — which is why
 * this names both rather than giving one set of steps.
 *
 * Deliberately not hidden behind OS detection. Someone reading this has already
 * hit the error and is scanning for the words they saw on screen; detection can
 * be wrong, and being wrong here means the one person who needs this cannot
 * find it.
 *
 * Collapsed by default. It is reassurance for the few who need it, not the
 * first thing everyone else should read on a download page.
 *
 * Plain <details>, so it works before any JavaScript loads — the same page a
 * stuck user is refreshing in frustration.
 */
export function MacOsFirstRun() {
  return (
    <details className="group mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <summary className="flex cursor-pointer list-none items-center gap-2.5 text-[15px] font-semibold text-white">
        <ShieldAlert className="size-5 shrink-0 text-[#e0a173]" aria-hidden />
        macOS says the app is damaged, or that it cannot be verified
      </summary>

      <div className="mt-4 flex flex-col gap-5 border-t border-white/8 pt-5">
        <p className="text-[13px] leading-relaxed text-white/55">
          Nothing is wrong with the download. Virgo is in beta and its Mac
          builds are not signed with an Apple Developer ID yet, so macOS cannot
          tell who made them and stops the first launch. Signing is coming; this
          step disappears when it does.
        </p>

        <p className="text-[13px] leading-relaxed text-white/55">
          Two different messages come from that one fact, so follow whichever
          you actually saw.
        </p>

        <div className="flex flex-col gap-2.5">
          <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-white/45">
            “Virgo is damaged and can’t be opened”
          </p>
          <p className="text-[13px] leading-relaxed text-white/55">
            Apple Silicon Macs need a signature before they will run anything at
            all, so an unsigned app reads to macOS as a broken one. Drag Virgo
            into Applications first, then run this in Terminal:
          </p>
          <code className="select-all rounded-xl border border-white/10 bg-black/40 px-4 py-3 font-mono text-[12px] leading-relaxed text-[#e0a173]">
            xattr -dr com.apple.quarantine /Applications/Virgo.app
          </code>
          <p className="text-[12px] leading-relaxed text-white/45">
            That clears the flag Chrome attaches to downloaded files. Open Virgo
            from Applications afterwards, and eject the disk image.
          </p>
        </div>

        <div className="flex flex-col gap-2.5">
          <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-white/45">
            “Apple could not verify Virgo is free of malware”
          </p>
          <p className="text-[13px] leading-relaxed text-white/55">
            Click Done, then open System Settings → Privacy &amp; Security and
            scroll to the Security section. It will say Virgo was blocked, with
            an <span className="text-white/75">Open Anyway</span> button beside
            it. Confirm with your password or Touch ID.
          </p>
        </div>

        <p className="text-[12px] leading-relaxed text-white/45">
          Both of these switch off a check that exists for good reason, so do it
          only for a copy downloaded from this page. If Virgo came from anywhere
          else, delete it.
        </p>
      </div>
    </details>
  );
}
