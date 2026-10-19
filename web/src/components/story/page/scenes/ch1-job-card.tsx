import type { ReactNode } from 'react';
import { FILLED, FORM, POSTED_STAMP } from '../../data/strings/ch1';
import { CH1 } from '../../data/strings/page-ch1';
import { GEAR_ASPECT, GearArt, ROLE_GEAR, type GearKind } from '../cinema/gear';

/**
 * Ch1's job post, composed for the film: the job Mika posts (story.ts › JOB,
 * the form's own labels) with each role row carrying its tool and its rate.
 * Server-safe (no hooks): the static page draws it as its still, and the
 * film wraps the rows, the button and the stamp to play them in.
 */

/** The tool that stands for a role (05-cinema.md §1.7). */
export function gearFor(role: string): GearKind {
  const r = role.toLowerCase();
  if (r === 'photographer') return ROLE_GEAR.photographer;
  if (r === 'videographer') return ROLE_GEAR.videographer;
  if (r === 'hmua') return ROLE_GEAR.hmua;
  if (r.includes('editor')) return ROLE_GEAR.editor;
  if (r === 'host') return 'mic';
  return 'light';
}

/** A piece of gear at a fixed height, its width from its own aspect. */
export function Gear({ kind, height, className = '' }: { kind: GearKind; height: number; className?: string }) {
  return (
    <span aria-hidden className={`inline-grid shrink-0 place-items-center ${className}`} style={{ height, width: Math.round(height * GEAR_ASPECT[kind]) }}>
      <GearArt kind={kind} className="h-full w-full" />
    </span>
  );
}

type Wrap = (node: ReactNode, i: number) => ReactNode;
const same: Wrap = (node) => node;

export function JobCard({
  wrapRow = same,
  wrapButton = same,
  wrapStamp = same,
  className = '',
}: {
  /** Wraps each role row (the film fades them in one by one). */
  wrapRow?: Wrap;
  wrapButton?: Wrap;
  wrapStamp?: Wrap;
  className?: string;
}) {
  return (
    <div
      className={`w-full rounded-[22px] border border-[#362F2B] bg-[linear-gradient(180deg,#24201C_0%,#181412_100%)] p-5 text-left shadow-[0_40px_80px_-40px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(255,255,255,0.06)] sm:p-6 ${className}`}
    >
      <div className="flex items-center gap-3">
        <Gear kind={gearFor('photographer')} height={30} />
        <p className="text-[15px] text-[#BCADA3]">{CH1.byline}</p>
      </div>
      <p className="mt-4 text-[19px] font-semibold leading-[1.2] tracking-[-0.01em] text-[#F2EDE8] sm:text-[21px]">{FILLED.title}</p>
      <p className="mt-1.5 text-[15px] text-[#BCADA3]">
        {FILLED.date} · {FILLED.where}
      </p>
      <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.14em] text-[#A08E84]">{FORM.budgetsLabel}</p>
      <ul className="mt-1">
        {FILLED.budgets.map((b, i) => (
          <li key={b.role} className="border-t border-[#2A2522] first:border-t-0">
            {wrapRow(
              <div className="flex items-center gap-4 py-3">
                <span className="grid w-14 shrink-0 place-items-center">
                  <Gear kind={gearFor(b.role)} height={b.role === 'HMUA' ? 40 : 30} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-medium leading-tight text-[#F2EDE8] sm:text-base">{b.role}</span>
                  <span className="mt-0.5 block text-[15px] font-semibold tabular-nums text-[#F0C88E]">
                    ₱{b.min} – {b.max}
                  </span>
                </span>
              </div>,
              i,
            )}
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        {wrapButton(
          <span className="inline-flex min-h-11 items-center rounded-full bg-[#A85D35] px-6 text-[15px] font-semibold text-white">{FORM.submit}</span>,
          0,
        )}
        {wrapStamp(<span className="font-mono text-xs uppercase tracking-[0.16em] text-[#D18A5A]">{POSTED_STAMP}</span>, 0)}
      </div>
    </div>
  );
}
