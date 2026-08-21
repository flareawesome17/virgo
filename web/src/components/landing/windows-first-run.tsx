import { ShieldAlert } from 'lucide-react';

/**
 * What to do when Windows refuses the installer.
 *
 * Same cause as the macOS section — the installers are unsigned — but Windows
 * has two protections that behave very differently, and conflating them would
 * give half of readers advice that cannot work.
 *
 * SmartScreen warns and offers a way through. Smart App Control does not — it
 * blocks unsigned software outright with no per-app exception, so the only
 * lever is the feature-wide toggle in Windows Security. That toggle is a real
 * option and is described as one, with the machine-wide consequence stated so
 * somebody remembers to put it back. Evaluation is the one setting that cannot
 * be returned to, which is worth knowing before touching it.
 *
 * The browser is offered first because it costs nothing and needs no decision.
 */
export function WindowsFirstRun() {
  return (
    <details className="group mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <summary className="flex cursor-pointer list-none items-center gap-2.5 text-[15px] font-semibold text-white">
        <ShieldAlert className="size-5 shrink-0 text-[#e0a173]" aria-hidden />
        Windows blocked the installer, or calls the publisher unknown
      </summary>

      <div className="mt-4 flex flex-col gap-5 border-t border-white/8 pt-5">
        <p className="text-[13px] leading-relaxed text-white/55">
          Same reason as on a Mac: Virgo is in beta and its installers are not
          signed yet, so Windows cannot tell who published them. Signing is
          coming. Which message you get depends on how your machine is set up.
        </p>

        <div className="flex flex-col gap-2.5">
          <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-white/45">
            “Windows protected your PC”
          </p>
          <p className="text-[13px] leading-relaxed text-white/55">
            This is SmartScreen, and it is the common one. Click{' '}
            <span className="text-white/75">More info</span>, then{' '}
            <span className="text-white/75">Run anyway</span>. If the installer
            asks to make changes and names the publisher as unknown, that is the
            same thing said twice — it is unsigned, not unsafe.
          </p>
        </div>

        <div className="flex flex-col gap-2.5">
          <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-white/45">
            Smart App Control blocked it
          </p>
          <p className="text-[13px] leading-relaxed text-white/55">
            Smart App Control only runs software it recognises, and unlike
            SmartScreen it has no per-app exception — there is no Run anyway to
            click. It will accept Virgo once the installers are signed.
          </p>
          <p className="text-[13px] leading-relaxed text-white/55">
            Easiest for now: use Virgo at{' '}
            <a
              href="https://virgo.ph"
              className="text-[#e0a173] underline underline-offset-2"
            >
              virgo.ph
            </a>{' '}
            in your browser, or install on a machine without it — Smart App
            Control only ever switches on for a clean install of Windows 11, so
            an upgraded machine almost certainly has SmartScreen instead.
          </p>
          <p className="text-[13px] leading-relaxed text-white/55">
            Or turn it off, install, and turn it back on: Windows Security → App
            &amp; browser control → Smart App Control. It guards everything on
            the machine rather than just this install, so it is worth switching
            back on once Virgo is in. One thing that is genuinely one-way —
            Evaluation. Leave that mode and On or Off are your only choices
            afterwards.
          </p>
        </div>

        <p className="text-[12px] leading-relaxed text-white/45">
          Run anyway is a real decision, so make it only for an installer
          downloaded from this page. If Virgo came from anywhere else, delete it.
        </p>
      </div>
    </details>
  );
}
