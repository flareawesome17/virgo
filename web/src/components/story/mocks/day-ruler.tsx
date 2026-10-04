import type { CSSProperties } from 'react';
import { CLEANUPS, RULER, RULER_COHORTS, RULER_END, RULER_LEGEND, dayLabel } from '../data/strings/ch7';

/**
 * Ch7's day ruler: from the wedding (Day 0) to the last clean-up (Day 112).
 * Page chrome, not Virgo UI — a diagram of what the app does: each file is
 * kept 90 days from its own upload and goes in the first nightly sweep after.
 *
 * The ruler itself is ONE path (§1.12: "one path or canvas, not 422 nodes"):
 * the axis, a tick every week (112 = 16 × 7), and a faint guide per upload
 * cohort from its upload day to its sweep. It is drawn in day units in an
 * SVG stretched to the width (`preserveAspectRatio="none"`, non-scaling
 * strokes), so it is exact at any width and never re-laid out.
 *
 *   Day 0  · 413 files ┃━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━○ Day 91
 *   Day 1  · 3 files   ┃━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━○ Day 92
 *   Day 21 · 6 files          ┃━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━○ Day 112
 *   ├──────┼──────┼──────┼──── … ────┼──────┤
 *   Day 0                                Day 112
 *
 * Over it, what a stage moves, each one element: per cohort its density
 * marks (a comb whose teeth and height grow with the batch: 413, 3 and 6
 * files, never a node per file), the gold span of the time its files have
 * left, and its sweep's ring; then the playhead. When a sweep runs, that
 * cohort's marks and gold span fade (the files are gone; the guide stays)
 * and its ring lights.
 *
 * Laid out in percentages of the track, so it works at any width; text is
 * 11 px and up and stays flat HTML.
 *
 * States (horizontal), styled from the root's `data-state`:
 * - `overview` (rest, and the reduced-motion figure): every cohort, every
 *   ring, no playhead and no counter (its row collapses: the overview is a
 *   still, never a frame of the scrub).
 * - `start`: the playhead at Day 0, the counter "Day 0".
 * - `day91` · `day92` · `day112`: the playhead at that sweep, the counter
 *   "Day 91 · 3:00 AM"; that sweep's ring lit and every swept cohort faded.
 * The counter is text a stage scrubs (tabular, reserved width); the playhead
 * moves by translateX(fraction × 100%) of its own full-width layer.
 *
 * `orientation="vertical"` is the reduced-motion timeline for phones: the
 * three uploads, the 90-day gap, then each sweep carrying its notice.
 *
 * Parts: day-ruler (data-state, data-orientation), ruler-counter, ruler-day,
 * ruler-time, ruler-path (the one path), ruler-cohort (data-cohort),
 * ruler-marks, ruler-life, ruler-sweep (data-day), ruler-sweep-lit
 * (data-day), ruler-playhead.
 */

export type DayRulerState = 'overview' | 'start' | 'day91' | 'day92' | 'day112';

const STATE_DAY: Record<DayRulerState, number> = {
  overview: 0,
  start: 0,
  day91: RULER_COHORTS[0].sweep,
  day92: RULER_COHORTS[1].sweep,
  day112: RULER_COHORTS[2].sweep,
};

/** Literal class strings, per cohort, so Tailwind sees them: a cohort's files fade once its sweep has run… */
const SWEPT_FADE = [
  'group-data-[state=day91]/ruler:opacity-[0.12] group-data-[state=day92]/ruler:opacity-[0.12] group-data-[state=day112]/ruler:opacity-[0.12]',
  'group-data-[state=day92]/ruler:opacity-[0.12] group-data-[state=day112]/ruler:opacity-[0.12]',
  'group-data-[state=day112]/ruler:opacity-[0.12]',
] as const;
/** …its label dims less, so the day stays readable… */
const SWEPT_DIM = [
  'group-data-[state=day91]/ruler:opacity-[0.45] group-data-[state=day92]/ruler:opacity-[0.45] group-data-[state=day112]/ruler:opacity-[0.45]',
  'group-data-[state=day92]/ruler:opacity-[0.45] group-data-[state=day112]/ruler:opacity-[0.45]',
  'group-data-[state=day112]/ruler:opacity-[0.45]',
] as const;
/** …and its ring lights. */
const SWEPT_LIT = [
  'group-data-[state=day91]/ruler:opacity-100 group-data-[state=day92]/ruler:opacity-100 group-data-[state=day112]/ruler:opacity-100',
  'group-data-[state=day92]/ruler:opacity-100 group-data-[state=day112]/ruler:opacity-100',
  'group-data-[state=day112]/ruler:opacity-100',
] as const;

/** A day as a percentage of the track. */
const at = (day: number) => (day / RULER_END) * 100;

/** The comb at a cohort's upload: more teeth, and taller, for a bigger batch. */
function comb(files: number): { width: number; height: number } {
  const teeth = Math.min(7, Math.max(2, Math.round(Math.log2(files + 1))));
  return { width: teeth * 2 - 1, height: Math.round(8 + Math.log10(files + 1) * 5) };
}

/** Lane heights (the first carries the "90 days" note under its line) and where each line sits. */
const LANE_H = [50, 36, 36] as const;
const LINE_Y = 24;
const LANE_TOP = LANE_H.map((_, i) => LANE_H.slice(0, i).reduce((sum, h) => sum + h, 0));
/** The axis line, under the lanes, and the plot's height (the line plus its ticks). */
const AXIS_Y = LANE_TOP[LANE_TOP.length - 1] + LANE_H[LANE_H.length - 1] + 4;
const PLOT_H = AXIS_Y + 6;

/** The one path, in day units across and px down: the cohort guides, the axis and a tick a week. */
const RULER_PATH = [
  ...RULER_COHORTS.map((c, i) => `M${c.day} ${LANE_TOP[i] + LINE_Y + 0.5}H${c.sweep}`),
  `M0 ${AXIS_Y + 0.5}H${RULER_END}`,
  ...Array.from({ length: Math.floor(RULER_END / 7) + 1 }, (_, w) => `M${w * 7} ${AXIS_Y}v5`),
].join('');

const COMB_TEETH = 'bg-[repeating-linear-gradient(90deg,#F7E7CF_0_1px,transparent_1px_2px)]';

export function DayRuler({
  state = 'overview',
  orientation = 'horizontal',
  className = '',
}: {
  state?: DayRulerState;
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}) {
  if (orientation === 'vertical') return <VerticalRuler className={className} />;

  const day = STATE_DAY[state];
  const swept = state === 'day91' || state === 'day92' || state === 'day112';

  return (
    <div
      aria-hidden
      data-part="day-ruler"
      data-state={state}
      data-orientation="horizontal"
      className={`group/ruler @container font-sans text-[#F2EDE8] ${className}`}
    >
      <div data-part="ruler-counter" className="mb-5 flex items-center gap-3 group-data-[state=overview]/ruler:hidden">
        <span
          data-part="ruler-day"
          className="min-w-[7ch] font-mono text-[2.75rem] leading-none tracking-[-0.03em] tabular-nums @[40rem]:text-[3.25rem]"
        >
          {dayLabel(day)}
        </span>
        <span data-part="ruler-time" className="min-w-[8ch] font-mono text-sm text-[#BCADA3] tabular-nums">
          {swept ? RULER.sweepTime : ''}
        </span>
      </div>

      {/* The plot. 6 px of room each side for the end rings; clip, never hide. */}
      <div className="px-[6px] [overflow-x:clip]">
        <div className="relative" style={{ height: PLOT_H }}>
          <svg
            aria-hidden
            className="absolute inset-x-0 top-0 w-full overflow-visible"
            style={{ height: PLOT_H }}
            viewBox={`0 0 ${RULER_END} ${PLOT_H}`}
            preserveAspectRatio="none"
          >
            <path
              data-part="ruler-path"
              d={RULER_PATH}
              fill="none"
              stroke="rgba(242,237,232,0.26)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {RULER_COHORTS.map((c, i) => {
            const x0 = at(c.day);
            const x1 = at(c.sweep);
            const teeth = comb(c.files);
            const lane: CSSProperties = { top: LANE_TOP[i], height: LANE_H[i] };
            return (
              <div key={c.id} data-part="ruler-cohort" data-cohort={c.id} className="absolute inset-x-0" style={lane}>
                <span
                  className={`absolute top-0 whitespace-nowrap text-[11px] leading-[14px] text-[#BCADA3] ${SWEPT_DIM[i]}`}
                  style={{ left: `calc(${x0}% + ${teeth.width + 6}px)` }}
                >
                  {c.label}
                </span>
                <span
                  className="absolute top-0 whitespace-nowrap text-[11px] leading-[14px] text-[#BCADA3]"
                  style={{ right: `calc(${100 - x1}% + 10px)` }}
                >
                  {dayLabel(c.sweep)}
                </span>

                <span
                  data-part="ruler-life"
                  className={`absolute h-[1.5px] rounded-full bg-[linear-gradient(90deg,#F0C88E,rgba(224,169,124,0.42))] ${SWEPT_FADE[i]}`}
                  style={{ left: `${x0}%`, width: `${x1 - x0}%`, top: LINE_Y }}
                />
                <span
                  data-part="ruler-marks"
                  className={`absolute ${COMB_TEETH} ${SWEPT_FADE[i]}`}
                  style={{ left: `${x0}%`, width: teeth.width, height: teeth.height, top: LINE_Y + 1 - teeth.height }}
                />
                {i === 0 && (
                  <span
                    className={`absolute whitespace-nowrap text-[11px] leading-[14px] text-[#A08E84] ${SWEPT_DIM[i]}`}
                    style={{ left: `${(x0 + x1) / 2}%`, top: LINE_Y + 8, transform: 'translateX(-50%)' }}
                  >
                    {RULER.window}
                  </span>
                )}

                <span
                  data-part="ruler-sweep"
                  data-day={c.sweep}
                  className="absolute -ml-[5px] size-[10px] rounded-full border-[1.5px] border-[rgba(242,237,232,0.6)] bg-[#161311]"
                  style={{ left: `${x1}%`, top: LINE_Y - 4 }}
                />
                <span
                  data-part="ruler-sweep-lit"
                  data-day={c.sweep}
                  className={`absolute -ml-[5px] size-[10px] rounded-full bg-[#D18A5A] opacity-0 shadow-[0_0_0_3px_rgba(209,138,90,0.22),0_0_12px_rgba(209,138,90,0.55)] ${SWEPT_LIT[i]}`}
                  style={{ left: `${x1}%`, top: LINE_Y - 4 }}
                />
              </div>
            );
          })}

          {/* The playhead: a full-width layer moved by translateX(fraction × 100%), from above the lanes to the axis. */}
          <div
            data-part="ruler-playhead"
            className="pointer-events-none absolute left-0 w-full opacity-100 group-data-[state=overview]/ruler:opacity-0"
            style={{ top: -10, height: AXIS_Y + 14, transform: `translateX(${Math.round(at(day) * 100) / 100}%)` }}
          >
            <span className="absolute inset-y-0 left-0 -ml-px w-[2px] bg-[linear-gradient(180deg,rgba(242,237,232,0),#F2EDE8_14%,#F2EDE8_86%,rgba(242,237,232,0))]" />
            <span className="absolute -top-1 left-0 -ml-[4px] size-2 rounded-full bg-[#F2EDE8] shadow-[0_0_10px_rgba(242,237,232,0.6)]" />
          </div>
        </div>

        <div className="relative mt-1.5 flex justify-between text-[11px] leading-[14px] text-[#A08E84]">
          <span>{dayLabel(0)}</span>
          <span>{dayLabel(RULER_END)}</span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] leading-[14px] text-[#A08E84]">
        <span className="flex items-center gap-1.5">
          <span className={`h-[10px] w-[7px] ${COMB_TEETH}`} />
          {RULER_LEGEND.uploaded}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-[10px] rounded-full border-[1.5px] border-[rgba(242,237,232,0.6)]" />
          {RULER_LEGEND.removed}
        </span>
      </div>
    </div>
  );
}

function VerticalRuler({ className }: { className: string }) {
  return (
    <div
      aria-hidden
      data-part="day-ruler"
      data-state="overview"
      data-orientation="vertical"
      className={`relative font-sans text-[#F2EDE8] ${className}`}
    >
      <div className="relative pl-8">
        {/* The spine: solid through the uploads, dashed across the wait, solid through the sweeps. */}
        <span className="absolute left-[11px] top-2 h-[124px] w-px bg-[rgba(242,237,232,0.22)]" />

        {RULER_COHORTS.map((c) => {
          const teeth = comb(c.files);
          return (
            <div key={`up-${c.id}`} className="relative h-11">
              <span
                className={`absolute -left-[22px] top-[3px] ${COMB_TEETH}`}
                style={{ width: teeth.width, height: teeth.height }}
              />
              <p className="font-mono text-[12px] leading-4 tabular-nums">{dayLabel(c.day)}</p>
              <p className="text-[13px] leading-[18px] text-[#BCADA3]">{c.uploadedLine}</p>
            </div>
          );
        })}

        <div className="relative py-3">
          <span className="absolute -left-[21px] bottom-1 top-1 w-px bg-[repeating-linear-gradient(180deg,rgba(242,237,232,0.35)_0_3px,transparent_3px_7px)]" />
          <p className="font-mono text-[11px] uppercase leading-4 tracking-[0.14em] text-[#A08E84]">{RULER.window}</p>
        </div>

        {RULER_COHORTS.map((c, i) => (
          <div key={`sweep-${c.id}`} className="relative pb-5 last:pb-0">
            {i < RULER_COHORTS.length - 1 && (
              <span className="absolute -left-[21px] bottom-0 top-3 w-px bg-[rgba(242,237,232,0.22)]" />
            )}
            <span className="absolute -left-[26px] top-[3px] size-[10px] rounded-full bg-[#D18A5A] shadow-[0_0_0_3px_rgba(209,138,90,0.22)]" />
            <p className="font-mono text-[12px] leading-4 tabular-nums">{c.sweepLine}</p>
            <p className="mt-0.5 text-[13px] font-semibold leading-[18px]">{CLEANUPS[i].title}</p>
            <p className="text-[13px] leading-[18px] text-[#BCADA3]">{CLEANUPS[i].body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
