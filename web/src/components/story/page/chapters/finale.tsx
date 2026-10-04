import { DOWNLOAD_PATH, SIGN_IN_URL, SIGN_UP_URL } from '@/components/landing/links';
import { STARS, starRadius, type StarId } from '../../data/constellation';
import { ROLES } from '../../data/story';
import { FINALE_COPY as T } from '../../data/strings/page-finale';
import { StarStop } from '../../svg';
import { BY_ID, chartBox, figurePath, percentIn, U } from '../../svg/chart';
import { FinaleStage, RolePicker } from '../islands/finale';

/**
 * Finale — "This one's you." · #start (storyboard §2 Finale, §1.13).
 *
 * Virgo drawn faint, with one empty socket at Syrma (ι Vir). On entry a new
 * star grows there, pulses twice and holds still, and the ζ–ι and ι–μ lines
 * complete the figure. The figure is a DOM stage of its own (an SVG for the
 * 13 fixed stars and 12 lines, HTML for what moves), so it never depends on
 * the sky canvas's state at the end of the page.
 *
 * This render is the final state, which is also the reduced-motion page: all
 * 14 stars lit and steady. `FinaleStage` arms and plays it in motion mode.
 */

const BOX = chartBox(7);
const SYRMA = BY_ID.get('iota')!;

/** One of Syrma's two lines, drawn outward from the new star: where it starts, how long, which way. */
function edge(to: StarId) {
  const b = BY_ID.get(to)!;
  const dx = (b.x - SYRMA.x) * U;
  const dy = (b.y - SYRMA.y) * U;
  return {
    ...percentIn(BOX, SYRMA),
    width: `${((Math.hypot(dx, dy) / BOX.width) * 100).toFixed(3)}%`,
    angle: `${((Math.atan2(dy, dx) * 180) / Math.PI).toFixed(2)}deg`,
  };
}

const EDGES = [
  { id: 'zeta', delay: '1500ms', ...edge('zeta') },
  { id: 'mu', delay: '1650ms', ...edge('mu') },
];

/** One ray per role, in the app's order, spread round the star from the top. */
const RAYS = ROLES.map((_, i) => `${(i * 360) / ROLES.length}deg`);

/** A little fixed dust behind the figure: decoration, never animated. */
const DUST = [
  [6, 12, 1.2], [14, 38, 0.8], [23, 8, 1], [31, 26, 0.7], [44, 14, 1.1], [52, 34, 0.8], [61, 6, 0.9], [68, 22, 1.2],
  [77, 40, 0.7], [86, 10, 1], [93, 30, 0.8], [9, 62, 0.7], [38, 56, 0.9], [72, 60, 0.8], [96, 52, 1], [57, 70, 0.6],
]
  .map(([x, y, r]) => `radial-gradient(${r}px ${r}px at ${x}% ${y}%, rgba(242,237,232,0.55), rgba(242,237,232,0) 100%)`)
  .join(', ');

export function Finale() {
  const syrma = percentIn(BOX, SYRMA);
  return (
    <section
      id="start"
      data-tone="night"
      data-chapter="start"
      aria-labelledby="start-title"
      className="relative z-10 bg-[#120F0E] [overflow-x:clip] [html[data-motion='on']_&]:min-h-[90svh] lg:[html[data-motion='on']_&]:min-h-svh"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ backgroundImage: DUST }} />
      {/* The faint warm horizon (§1.4): night to the end, with a last glow. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[55%] bg-[radial-gradient(70%_60%_at_50%_100%,rgba(209,138,90,0.16),rgba(107,62,37,0.06)_45%,rgba(18,15,14,0)_75%)]"
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[linear-gradient(#161311,rgba(18,15,14,0))]" aria-hidden />

      <FinaleStage>
        <div className="relative mx-auto grid max-w-6xl gap-10 px-5 pt-16 pb-20 sm:gap-14 sm:px-8 sm:pt-24 sm:pb-28 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.12fr)] lg:gap-x-14 lg:gap-y-10 lg:pt-28">
          <figure className="m-0 lg:col-start-2 lg:row-start-1 lg:self-end">
            <div aria-hidden className="f-sky relative mx-auto w-full [perspective:900px] md:[perspective:1200px]">
              <div
                className="f-figure relative"
                style={{ aspectRatio: `${BOX.width} / ${BOX.height.toFixed(2)}`, transformOrigin: `${syrma.left} ${syrma.top}` }}
              >
                <svg viewBox={BOX.attr} focusable="false" className="absolute inset-0 h-full w-full overflow-visible">
                  <path
                    d={figurePath(false)}
                    fill="none"
                    stroke="#F0C88E"
                    strokeOpacity={0.34}
                    strokeWidth={1}
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                  {STARS.filter((s) => s.id !== 'iota').map((s) => {
                    const r = starRadius(s.mag, 0.55, 1.5);
                    const cx = +(s.x * U).toFixed(2);
                    const cy = +(s.y * U).toFixed(2);
                    return (
                      <g key={s.id}>
                        <circle cx={cx} cy={cy} r={r * 3} fill="#F0C88E" opacity={0.1} />
                        <circle cx={cx} cy={cy} r={r} fill="#F7EFE6" opacity={0.85} />
                      </g>
                    );
                  })}
                  {/* The empty socket: what a reader sees before the new star. */}
                  <circle
                    cx={+(SYRMA.x * U).toFixed(2)}
                    cy={+(SYRMA.y * U).toFixed(2)}
                    r={1.6}
                    fill="none"
                    stroke="#F0C88E"
                    strokeOpacity={0.6}
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>

                {EDGES.map((e) => (
                  <span
                    key={e.id}
                    className="f-edge absolute h-[1.5px] origin-[0_50%] rounded-full bg-[linear-gradient(90deg,#FFE9C9,rgba(240,200,142,0.55))]"
                    style={{ left: e.left, top: e.top, width: e.width, marginTop: '-0.75px', ['--a' as string]: e.angle, ['--d' as string]: e.delay }}
                  />
                ))}

                <div className="f-syrma absolute size-24 -translate-1/2 sm:size-32" style={{ left: syrma.left, top: syrma.top }}>
                  <span className="f-halo absolute inset-0 rounded-full bg-[radial-gradient(closest-side,rgba(240,200,142,0.5),rgba(240,200,142,0.14)_50%,rgba(240,200,142,0))]" />
                  {RAYS.map((r, i) => (
                    <span
                      key={r}
                      data-ray={i}
                      className="f-ray absolute bottom-1/2 left-1/2 -ml-px h-[46%] w-0.5 origin-bottom rounded-full bg-[linear-gradient(0deg,rgba(255,233,201,0.95),rgba(240,200,142,0))]"
                      style={{ ['--r' as string]: r }}
                    />
                  ))}
                  <span className="absolute top-1/2 left-1/2 h-px w-[78%] -translate-1/2 bg-[linear-gradient(90deg,rgba(255,233,201,0),#FFE9C9,rgba(255,233,201,0))]" />
                  <span className="absolute top-1/2 left-1/2 h-[62%] w-px -translate-1/2 bg-[linear-gradient(180deg,rgba(255,233,201,0),#FFE9C9,rgba(255,233,201,0))]" />
                  <span className="absolute top-1/2 left-1/2 size-3.5 -translate-1/2 rounded-full bg-[radial-gradient(closest-side,#FFFFFF,#FFE9C9_45%,#F0C88E_80%,rgba(240,200,142,0))] sm:size-4" />
                </div>
                <span
                  className="f-label absolute translate-x-[-50%] translate-y-[2.6rem] font-mono text-[11px] tracking-[0.14em] text-[#F2EDE8] uppercase sm:translate-y-[3.4rem] sm:text-xs"
                  style={{ left: syrma.left, top: syrma.top }}
                >
                  {T.you}
                </span>
              </div>
            </div>
            <figcaption className="mt-4 text-sm leading-relaxed text-[#A08E84] [html[data-motion='on']_&]:sr-only">
              {T.caption}
            </figcaption>
          </figure>

          <div className="lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:self-center">
            <h2
              id="start-title"
              className="max-w-[9ch] text-[16vw] leading-[0.9] font-semibold tracking-[-0.045em] text-[#F2EDE8] sm:max-w-none sm:text-[clamp(3.5rem,1rem+5vw,6rem)]"
            >
              {T.title}
              <StarStop />
            </h2>
            <p className="mt-6 max-w-[34ch] text-[1.0625rem] leading-[1.55] text-[#BCADA3] sm:text-lg lg:max-w-[46ch] lg:text-xl">{T.body}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                href={SIGN_UP_URL}
                className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#D18A5A] px-7 text-base font-semibold text-[#161311] shadow-[0_10px_40px_-12px_rgba(209,138,90,0.6)] transition-colors hover:bg-[#E09A69] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#F2EDE8]"
              >
                {T.join}
              </a>
              <a
                href={SIGN_IN_URL}
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/15 px-7 text-base font-semibold text-[#F2EDE8] transition-colors hover:border-white/30 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#F2EDE8]"
              >
                {T.signIn}
              </a>
            </div>
            <p className="mt-5 max-w-[46ch] text-sm leading-relaxed text-[#A08E84]">
              {T.microBefore}{' '}
              <a
                href={DOWNLOAD_PATH}
                className="rounded-sm text-[#D18A5A] underline decoration-[#D18A5A]/40 underline-offset-4 hover:decoration-[#D18A5A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F2EDE8]"
              >
                {T.microLink}
              </a>
              {T.microAfter}
            </p>
          </div>
          <div className="lg:col-start-2 lg:row-start-2">
            <RolePicker roles={ROLES} legend={T.pickerLegend} hint={T.pickerHint} you={T.you} />
          </div>

          <p className="text-xs leading-relaxed text-[#A08E84] lg:col-span-2">{T.footnote}</p>
        </div>
      </FinaleStage>

      <style>{`
        .finale-stage .f-figure { transform: rotateX(8deg); transition: transform 900ms cubic-bezier(0.16,1,0.3,1), opacity 900ms cubic-bezier(0.16,1,0.3,1); }
        .finale-stage .f-edge { transform: rotate(var(--a)) scaleX(1); transition: transform 700ms cubic-bezier(0.16,1,0.3,1) var(--d); }
        .finale-stage .f-syrma { transition: transform 1200ms cubic-bezier(0.16,1,0.3,1) 700ms, opacity 600ms cubic-bezier(0.16,1,0.3,1) 700ms; }
        .finale-stage .f-label { transition: opacity 400ms cubic-bezier(0.2,0,0,1) 1900ms; }
        .finale-stage .f-halo { opacity: 0.9; }
        .finale-stage .f-ray { transform: rotate(var(--r)) scaleY(0); opacity: 0; transition: transform 320ms cubic-bezier(0.16,1,0.3,1), opacity 200ms cubic-bezier(0.2,0,0,1); }
        .finale-stage .f-ray[data-on] { transform: rotate(var(--r)) scaleY(1); opacity: 1; }
        @media (min-width: 1024px) { .finale-stage .f-figure { transform: rotateX(12deg); } }

        html[data-motion='on'] .finale-stage[data-state='armed'] .f-figure { transform: rotateX(10deg) translateY(4%) scale(0.92); opacity: 0.55; }
        @media (min-width: 1024px) {
          html[data-motion='on'] .finale-stage[data-state='armed'] .f-figure { transform: rotateX(18deg) translateY(5%) scale(0.9); }
        }
        html[data-motion='on'] .finale-stage[data-state='armed'] .f-edge { transform: rotate(var(--a)) scaleX(0); }
        html[data-motion='on'] .finale-stage[data-state='armed'] .f-syrma { transform: scale(0.4); opacity: 0; }
        html[data-motion='on'] .finale-stage[data-state='armed'] .f-label { opacity: 0; }
        html[data-motion='on'] .finale-stage[data-state='lit'] .f-halo { animation: finale-pulse 1000ms cubic-bezier(0.65,0,0.35,1) 1900ms 2 both; }
        html[data-motion='on'] .finale-stage[data-state='lit'] h2 [data-part='star-stop'] { transform-origin: 50% 50%; animation: finale-echo 1100ms cubic-bezier(0.16,1,0.3,1) 2200ms 1 both; }
        html[data-paused] .finale-stage * { animation-play-state: paused !important; }
        html:not([data-motion='on']) .finale-stage * { transition: none !important; }
        @keyframes finale-pulse { 0%, 100% { transform: scale(1); opacity: 0.9; } 45% { transform: scale(1.45); opacity: 0.4; } }
        @keyframes finale-echo { 0%, 100% { transform: scale(1); } 40% { transform: scale(1.7); } }
      `}</style>
    </section>
  );
}
