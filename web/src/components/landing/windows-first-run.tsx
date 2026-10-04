import { ChevronDown, ShieldAlert } from 'lucide-react';
import { APP_URL } from './links';

/**
 * What to do when Windows refuses the installer.
 *
 * The Windows installers are not signed yet, and Windows has two protections
 * that behave very differently; conflating them would give half of readers
 * advice that cannot work.
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
    <details className="group mt-6 rounded-[20px] border border-[#2A2522] bg-[linear-gradient(165deg,#211C19,#1A1614)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-6">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-lg text-[15px] font-semibold text-[#F2EDE8] focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[#F2EDE8]">
        <ShieldAlert className="size-5 shrink-0 text-[#F0C88E]" aria-hidden />
        <span className="flex-1">Windows blocked the installer, or calls the publisher unknown</span>
        <ChevronDown className="size-4 shrink-0 text-[#A08E84] transition-transform group-open:rotate-180" aria-hidden />
      </summary>

      <div className="mt-4 flex flex-col gap-5 border-t border-[#2A2522] pt-5">
        <p className="text-[14px] leading-relaxed text-[#BCADA3]">
          Virgo is in beta and its Windows installers are not signed yet, so
          Windows cannot tell who published them. Signing is coming. Which
          message you get depends on how your machine is set up.
        </p>

        <div className="flex flex-col gap-2.5">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#A08E84]">
            “Windows protected your PC”
          </p>
          <p className="text-[14px] leading-relaxed text-[#BCADA3]">
            This is SmartScreen, and it is the common one. Click{' '}
            <span className="text-[#F2EDE8]">More info</span>, then{' '}
            <span className="text-[#F2EDE8]">Run anyway</span>. If the installer
            asks to make changes and names the publisher as unknown, that is the
            same thing said twice — it is unsigned, not unsafe.
          </p>
        </div>

        <div className="flex flex-col gap-2.5">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#A08E84]">
            Smart App Control blocked it
          </p>
          <p className="text-[14px] leading-relaxed text-[#BCADA3]">
            Smart App Control only runs software it recognises, and unlike
            SmartScreen it has no per-app exception — there is no Run anyway to
            click. It will accept Virgo once the installers are signed.
          </p>
          <p className="text-[14px] leading-relaxed text-[#BCADA3]">
            Easiest for now: use Virgo at{' '}
            <a
              href={APP_URL}
              className="text-[#F0C88E] underline underline-offset-2"
            >
              web.virgo.ph
            </a>{' '}
            in your browser, or install on a machine without it — Smart App
            Control only ever switches on for a clean install of Windows 11, so
            an upgraded machine almost certainly has SmartScreen instead.
          </p>
          <p className="text-[14px] leading-relaxed text-[#BCADA3]">
            Or turn it off, install, and turn it back on: Windows Security → App
            &amp; browser control → Smart App Control. It guards everything on
            the machine rather than just this install, so it is worth switching
            back on once Virgo is in. One thing that is genuinely one-way —
            Evaluation. Leave that mode and On or Off are your only choices
            afterwards.
          </p>
        </div>

        <p className="text-[13px] leading-relaxed text-[#A08E84]">
          Run anyway is a real decision, so make it only for an installer
          downloaded from this page. If Virgo came from anywhere else, delete it.
        </p>
      </div>
    </details>
  );
}
