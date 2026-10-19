import { VIEWFINDER } from '../data/strings/ch5';

/**
 * A camera's framing over the golden-hour stage (Ch5 p 0.08–0.30): four
 * corner marks and the exposure, "1/250 · f/2.8 · ISO 200". Page chrome,
 * not Virgo UI, and no camera's in particular.
 *
 * It fills its positioned parent (absolute, inset 0) and takes no pointer
 * events. On gold the marks are ink, never white (white is under 2:1 on
 * #F0C88E); the readout sits on its own dark pill, because nothing under
 * 24 px may sit straight on the gold's darker stops (§1.5). On night, the
 * marks turn light.
 *
 * States, styled from the root's `data-state`: `off` · `marks` (mobile: the
 * corners only) · `readout` (rest). Fade or draw the corners in by opacity
 * and transform; each is positioned without transforms, so a stage may
 * write its own.
 *
 * Parts: viewfinder (data-state, data-tone), vf-corner (data-corner tl, tr,
 * bl, br), vf-readout.
 */

export type ViewfinderState = 'off' | 'marks' | 'readout';

const CORNERS = [
  { key: 'tl', place: 'left-[6%] top-[8%]', edges: 'border-l-2 border-t-2 rounded-tl-[3px]' },
  { key: 'tr', place: 'right-[6%] top-[8%]', edges: 'border-r-2 border-t-2 rounded-tr-[3px]' },
  { key: 'bl', place: 'bottom-[8%] left-[6%]', edges: 'border-b-2 border-l-2 rounded-bl-[3px]' },
  { key: 'br', place: 'bottom-[8%] right-[6%]', edges: 'border-b-2 border-r-2 rounded-br-[3px]' },
] as const;

export function Viewfinder({
  state = 'readout',
  tone = 'gold',
  className = '',
}: {
  state?: ViewfinderState;
  /** The ground under it: ink marks on gold, light marks on night. */
  tone?: 'gold' | 'night';
  className?: string;
}) {
  const ink = tone === 'gold' ? 'border-[rgba(30,27,24,0.78)]' : 'border-[rgba(242,237,232,0.82)]';

  return (
    <div
      aria-hidden
      data-part="viewfinder"
      data-state={state}
      data-tone={tone}
      className={`group/vf pointer-events-none absolute inset-0 ${className}`}
    >
      {CORNERS.map((c) => (
        <span
          key={c.key}
          data-part="vf-corner"
          data-corner={c.key}
          className={`absolute size-5 opacity-100 group-data-[state=off]/vf:opacity-0 md:size-7 ${c.place} ${c.edges} ${ink}`}
        />
      ))}
      <div className="absolute inset-x-0 bottom-[8%] flex justify-center px-[14%]">
        <span
          data-part="vf-readout"
          className="whitespace-nowrap rounded-full bg-[rgba(22,19,17,0.82)] px-3 py-1 font-mono text-[12px] leading-4 tracking-[0.04em] text-[#F2EDE8] tabular-nums opacity-0 group-data-[state=readout]/vf:opacity-100"
        >
          {VIEWFINDER.readout}
        </span>
      </div>
    </div>
  );
}
