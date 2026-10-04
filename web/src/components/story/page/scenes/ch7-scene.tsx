'use client';

import { m, useMotionValueEvent, useTransform, type MotionValue } from 'framer-motion';
import { Images, Video } from 'lucide-react';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { CLIENT } from '../../data/story';
import { dayLabel } from '../../data/strings/ch7';
import { CH7_COPY } from '../../data/strings/page-ch7';
import { Plate } from '../../mocks/plate';
import { RetentionField } from '../../mocks/retention-field';
import { StorageMeter, meterReading } from '../../mocks/storage-meter';
import { camera, enter, lerp, r2, seg, window4 } from '../cinema/ease';
import { Flare, LightSweep, Particles, useCamera, useReveal } from '../cinema/fx';
import { Morph } from '../cinema/morph';
import { Illustrative, Shot, Subtitles, type Line } from '../cinema/shot';
import { useNarrow } from '../islands/ch7';

/**
 * Ch7 · Day 91 · #forget, the film (05-cinema.md §3). One calm shot, the
 * quiet after Saturday. The central tunnel cut opens on it; it ends in a gold
 * leak that fills the frame, which The work opens out of (no central cut).
 *
 *   0.00–0.22  Zoom in: the album dollies in from far; its tiles ease in.
 *   0.02–0.25  "Hand it over."  The setting chosen when the album was made
 *              (Keep files for: 90 days after upload).
 *   0.27–0.49  "Then forget about it."  The setting recedes; the slate counts
 *              Day 21 → Day 91 and a gold rule draws across the frame.
 *   0.51–0.74  "Each file leaves on its own schedule."  Each tile shrinks
 *              and morphs into a fading star (square → sparkle → circle):
 *              Saturday's on Day 91, Sunday's on Day 92, the films on Day 112.
 *   0.76–0.97  "The storage comes back."  The meter drains to 307 MB; the
 *              camera pushes to it; the gold leak fills the frame (0.84–0.97).
 *
 * Geometry: storage rings behind the album, the day rule with its sweeps.
 * Product truth: retention is per file, counted from each upload; the album
 * and its link stay. Compositor-only; the slate and the meter's readings are
 * written to the DOM when they change, never through React state.
 */

const LINES: readonly Line[] = [
  { text: CH7_COPY.lines[0], from: 0.02, to: 0.25 },
  { text: CH7_COPY.lines[1], from: 0.27, to: 0.49 },
  { text: CH7_COPY.lines[2], from: 0.51, to: 0.74 },
  { text: CH7_COPY.lines[3], from: 0.76, to: 0.97 },
];

/** Each tile is a batch of the album's files, leaving with its own sweep (progress). */
const TILES: readonly { seed: number; at: number; film?: boolean }[] = [
  { seed: 3, at: 0.5 },
  { seed: 17, at: 0.53 },
  { seed: 29, at: 0.705, film: true },
  { seed: 44, at: 0.515 },
  { seed: 8, at: 0.545 },
  { seed: 61, at: 0.6 },
  { seed: 72, at: 0.56 },
  { seed: 35, at: 0.718, film: true },
  { seed: 90, at: 0.538 },
  { seed: 13, at: 0.57 },
  { seed: 51, at: 0.507 },
  { seed: 26, at: 0.552 },
];

/** Opens as a zoom in (far and small → near), then drifts slowly. */
const CAMERA = [
  { at: 0, scale: 0.6, rx: 22, ry: -18, y: 4 },
  { at: 0.22, scale: 1, rx: 11, ry: -8 },
  { at: 0.5, scale: 1.02, rx: 8, ry: 2, y: -1 },
  { at: 0.76, scale: 1.04, rx: 6, ry: 9, x: -2 },
  { at: 1, scale: 1.12, rx: 4, ry: 14, x: -4, y: -2 },
] as const;

/** The slate's day: Day 21 (the films delivered) → 91, then 92, then 112. */
function dayAt(p: number) {
  if (p < 0.29) return 21;
  if (p < 0.47) return 21 + camera(seg(p, 0.29, 0.47)) * 70;
  if (p < 0.595) return 91;
  if (p < 0.63) return 92;
  return 92 + camera(seg(p, 0.63, 0.7)) * 20;
}
const LAST_DAY = 112;
/** The day rule's marks: delivery, then each sweep. */
const MARKS = [21, 91, 92, 112] as const;

/** Mika's meter before the first sweep and after each one. */
const READINGS = (['beforeCleanUp', 'day91', 'day92', 'day112'] as const).map((s) => meterReading(s));
const stepAt = (p: number) => (p >= 0.72 ? 3 : p >= 0.615 ? 2 : p >= 0.555 ? 1 : 0);
function fractionAt(p: number) {
  const [a, b, c, d] = READINGS.map((x) => x.fraction);
  return a + (b - a) * enter(seg(p, 0.555, 0.6)) + (c - b) * enter(seg(p, 0.615, 0.64)) + (d - c) * enter(seg(p, 0.72, 0.76));
}

/** The leak's colour: a centred radial, the same at top and bottom edges, so The work's stage meets it without a seam. */
const LEAK = 'bg-[radial-gradient(120%_90%_at_50%_50%,#E2AC74_0%,#9C6038_55%,#4A2C1C_100%)]';

type Painted = { day: number; step: number; fill: HTMLElement | null; used: HTMLElement | null; files: HTMLElement | null };

/** Writes the slate's day and the meter's reading for a progress. */
function paint(p: number, slate: HTMLElement | null, meter: HTMLElement | null, last: Painted) {
  const day = Math.floor(dayAt(p) + 1e-6);
  if (slate && day !== last.day) {
    slate.textContent = dayLabel(day);
    last.day = day;
  }
  if (!meter) return;
  if (!last.fill) {
    last.fill = meter.querySelector<HTMLElement>('[data-part="meter-fill"]');
    last.used = meter.querySelector<HTMLElement>('[data-part="meter-used"]');
    last.files = meter.querySelector<HTMLElement>('[data-part="meter-files"]');
  }
  const step = stepAt(p);
  if (step !== last.step) {
    if (last.used) last.used.textContent = READINGS[step].used;
    if (last.files) last.files.textContent = String(READINGS[step].files);
    last.step = step;
  }
  if (last.fill) last.fill.style.transform = `scaleX(${Math.round(fractionAt(p) * 10000) / 10000})`;
}

export function Ch7Scene({ length }: { length: number }) {
  return (
    <Shot length={length} className="bg-[#161311]">
      {(progress) => <Frame progress={progress} />}
    </Shot>
  );
}

function Frame({ progress }: { progress: MotionValue<number> }) {
  const narrow = useNarrow();
  const slate = useRef<HTMLSpanElement>(null);
  const meter = useRef<HTMLDivElement>(null);
  const last = useRef<Painted>({ day: -1, step: -1, fill: null, used: null, files: null });

  useMotionValueEvent(progress, 'change', (p) => paint(p, slate.current, meter.current, last.current));
  useEffect(() => {
    paint(progress.get(), slate.current, meter.current, last.current);
  }, [progress]);

  const rig = useCamera(progress, CAMERA);
  const far = useTransform(progress, (p) => `translate3d(0,${r2(-p * 4)}vh,0) scale(${r2(1 + p * 0.06)})`);
  const glow = useTransform(progress, (p) => r2(0.3 + 0.5 * enter(seg(p, 0.74, 0.9))));
  const leak = useTransform(progress, (p) => r2(camera(seg(p, 0.84, 0.97))));
  const album = useReveal(progress, -0.1, 0, 0.88, 0.97, { y: 0, scale: 0.98 });
  const ret = useReveal(progress, 0.03, 0.1, 0.2, 0.3);
  const meterIn = useReveal(progress, 0.4, 0.48, 0.9, 0.98);
  const albumDim = useTransform(progress, (p) => r2(1 - 0.4 * seg(p, 0.78, 0.9)));

  // The setting recedes into the past; the meter comes forward as the storage returns.
  const retZ = useTransform(progress, (p) => `translate3d(0,0,${r2(lerp(70, -160, camera(seg(p, 0.2, 0.31))))}px)`);
  const meterZ = useTransform(progress, (p) => `translate3d(0,0,${r2(40 + camera(seg(p, 0.76, 0.95)) * 60)}px)`);
  const meterGlow = useTransform(progress, (p) => r2(0.85 * enter(seg(p, 0.74, 0.86))));

  return (
    <>
      {/* (a) The far sky: a few still stars, drifting slower than everything else. */}
      <m.div
        aria-hidden
        style={{ transform: far }}
        className="pointer-events-none absolute -inset-[6%] bg-[radial-gradient(1.5px_1.5px_at_12%_22%,rgba(242,237,232,0.55),transparent),radial-gradient(1px_1px_at_28%_64%,rgba(242,237,232,0.45),transparent),radial-gradient(1.5px_1.5px_at_71%_18%,rgba(247,217,176,0.6),transparent),radial-gradient(1px_1px_at_86%_52%,rgba(242,237,232,0.4),transparent),radial-gradient(1px_1px_at_44%_10%,rgba(242,237,232,0.4),transparent),radial-gradient(1.5px_1.5px_at_92%_80%,rgba(247,217,176,0.45),transparent),radial-gradient(1px_1px_at_6%_78%,rgba(242,237,232,0.35),transparent)]"
      />
      {/* (b) Light: a low warm horizon that grows as the storage comes back. */}
      <m.div
        aria-hidden
        style={{ opacity: glow }}
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[60svh] bg-[radial-gradient(70%_60%_at_50%_100%,rgba(209,138,90,0.32),rgba(209,138,90,0)_70%)]"
      />
      <Rings progress={progress} />
      <DayRule progress={progress} />

      {/* (c) The album, the setting it was made with, and Mika's meter, under one camera. */}
      <div className="absolute left-1/2 top-[38%] w-[min(78vw,500px)] -translate-x-1/2 -translate-y-1/2 lg:left-[40%] lg:top-[42%] xl:left-[44%]">
        <m.div aria-hidden style={{ transform: rig, transformStyle: 'preserve-3d' }} className="relative">
          <m.div style={{ opacity: album.opacity, transform: album.transform }}>
            <m.div
              style={{ opacity: albumDim }}
              className="rounded-2xl bg-[#1E1B18] p-2.5 shadow-[0_40px_80px_-30px_rgba(0,0,0,0.9)] ring-1 ring-[rgba(242,237,232,0.1)] lg:p-3"
            >
              <div className="mb-2.5 flex items-center gap-2 px-1 text-sm font-semibold text-[#F2EDE8]">
                <Images aria-hidden className="size-4 text-[#A08E84]" />
                <span className="truncate">{CLIENT.album}</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5 lg:grid-cols-4 lg:gap-2">
                {TILES.map((tile, i) => (
                  <Tile key={tile.seed} progress={progress} tile={tile} i={i} />
                ))}
              </div>
            </m.div>
          </m.div>

          <m.div style={{ transform: retZ }} className="absolute -left-[3%] -top-[12%] w-[92%] lg:-left-[10%] lg:w-[78%]">
            <m.div
              style={{ opacity: ret.opacity, transform: ret.transform }}
              className="rounded-xl bg-[#1E1B18] p-4 shadow-[0_30px_60px_-24px_rgba(0,0,0,0.9)] ring-1 ring-[rgba(242,237,232,0.12)]"
            >
              <RetentionField state="chosen" />
            </m.div>
          </m.div>

          <m.div
            style={{ transform: meterZ }}
            className="absolute inset-x-[5%] top-[60%] lg:inset-x-auto lg:left-[calc(100%+28px)] lg:top-[30%] lg:w-[300px] xl:w-[340px]"
          >
            <m.div style={{ opacity: meterIn.opacity, transform: meterIn.transform }} className="relative">
              <m.div
                style={{ opacity: meterGlow }}
                className="pointer-events-none absolute -inset-10 bg-[radial-gradient(closest-side,rgba(240,200,142,0.32),rgba(240,200,142,0))]"
              />
              <div ref={meter} className="relative">
                <StorageMeter platform="web" state="beforeCleanUp" className="shadow-[0_30px_60px_-24px_rgba(0,0,0,0.9)] [&>div]:py-3" />
              </div>
            </m.div>
          </m.div>
        </m.div>
      </div>

      {/* (d) A few motes on the wind while the files go; then the gold leak fills the frame. */}
      <Particles progress={progress} push={[0.5, 0.82]} count={narrow ? 8 : 14} seed={91} />
      <Flare progress={progress} from={0.76} to={0.98} x={narrow ? 50 : 66} y={narrow ? 58 : 46} size={narrow ? 420 : 620} />
      <LightSweep progress={progress} from={0.8} to={0.96} />
      <m.div aria-hidden style={{ opacity: leak }} className={`pointer-events-none absolute inset-0 z-20 ${LEAK}`} />

      <p className="pointer-events-none absolute left-5 top-6 z-30 font-mono text-[11px] uppercase tracking-[0.2em] text-[#D18A5A] tabular-nums sm:left-8 sm:top-8 sm:text-xs">
        <span className="sr-only">{CH7_COPY.slate}</span>
        <span ref={slate} aria-hidden>
          {dayLabel(21)}
        </span>
      </p>
      <Illustrative />
      <Subtitles progress={progress} lines={LINES} />
    </>
  );
}

/** A tile of the album: eases in on the zoom, and at its own sweep shrinks and morphs into a star that rises and fades. */
function Tile({ progress, tile, i }: { progress: MotionValue<number>; tile: (typeof TILES)[number]; i: number }) {
  const { at } = tile;
  const a = 0.02 + (i % 9) * 0.014;
  const enterIn = useReveal(progress, a, a + 0.08, 2, 3, { y: 14, scale: 0.9 });
  const plateT = useTransform(progress, (p) => `scale(${r2(1 - enter(seg(p, at, at + 0.03)) * 0.8)})`);
  const plateO = useTransform(progress, (p) => r2(1 - enter(seg(p, at + 0.004, at + 0.03))));
  // The morph: the tile's square becomes a sparkle, then a circle, shrinking and rising as it fades.
  const starO = useTransform(progress, (p) => r2(window4(p, at + 0.004, at + 0.018, at + 0.045, at + 0.085)));
  const starT = useTransform(progress, (p) => {
    const t = seg(p, at, at + 0.085);
    return `translate3d(0,${r2(-t * 30)}px,0) scale(${r2(lerp(0.9, 0.22, camera(t)))})`;
  });
  const keys = useMemo(
    () => [
      { at: at + 0.006, shape: 'square' as const },
      { at: at + 0.035, shape: 'sparkle' as const },
      { at: at + 0.08, shape: 'circle' as const },
    ],
    [at],
  );
  return (
    <m.div style={{ opacity: enterIn.opacity, transform: enterIn.transform }} className={`relative aspect-square ${i >= 9 ? 'hidden lg:block' : ''}`}>
      <m.div style={{ transform: plateT, opacity: plateO }} className="absolute inset-0 overflow-hidden rounded-lg">
        <Plate seed={tile.seed} aspect="fill" />
        {tile.film && (
          <span className="absolute bottom-1.5 left-1.5 grid size-6 place-items-center rounded-md bg-[rgba(22,19,17,0.72)]">
            <Video aria-hidden className="size-3.5 text-[#F2EDE8]" />
          </span>
        )}
      </m.div>
      <m.div style={{ opacity: starO, transform: starT }} className="pointer-events-none absolute inset-[6%]">
        <span className="absolute inset-[20%] rounded-full bg-[radial-gradient(closest-side,rgba(247,217,176,0.55),rgba(209,138,90,0))]" />
        <Morph progress={progress} keys={keys} fill="#FFF4E4" className="relative block size-full" />
      </m.div>
    </m.div>
  );
}

/** Geometry: hairline storage rings behind the album, easing in one by one and turning slowly with the camera. */
function Rings({ progress }: { progress: MotionValue<number> }) {
  const turn = useTransform(progress, (p) => `translate3d(-50%,-50%,0) rotate(${r2(p * 24)}deg) scale(${r2(0.8 + camera(p) * 0.3)})`);
  return (
    <m.div aria-hidden style={{ transform: turn }} className="pointer-events-none absolute left-1/2 top-[40%] size-[120vmin] lg:left-[46%]">
      {[0.42, 0.62, 0.82, 1].map((s, i) => (
        <Ring key={s} progress={progress} size={s} i={i} />
      ))}
    </m.div>
  );
}

function Ring({ progress, size, i }: { progress: MotionValue<number>; size: number; i: number }) {
  const r = useReveal(progress, 0.02 + i * 0.04, 0.12 + i * 0.04, 0.88 + i * 0.02, 0.97, { y: 0, scale: 0.9 });
  const pct = `${size * 100}%`;
  return (
    <m.div style={{ opacity: r.opacity }} className="absolute left-1/2 top-1/2">
      <m.div
        style={{ transform: r.transform, width: pct, height: pct }}
        className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border ${i % 2 ? 'border-dashed border-[rgba(209,138,90,0.14)]' : 'border-[rgba(209,138,90,0.1)]'}`}
      />
    </m.div>
  );
}

/** Geometry: a thin gold rule that draws across the top of the frame as the days pass, with a mark at delivery and at each sweep. */
function DayRule({ progress }: { progress: MotionValue<number> }) {
  const life = useReveal(progress, 0.24, 0.3, 0.9, 0.97, { y: 0, scale: 1 });
  const draw = useTransform(progress, (p) => `scaleX(${r2(Math.max(0.0001, (dayAt(p) - 21) / (LAST_DAY - 21)))})`);
  return (
    <m.div aria-hidden style={{ opacity: life.opacity }} className="pointer-events-none absolute inset-x-[8%] top-[10svh] h-2 lg:inset-x-[12%] lg:top-[13svh]">
      <div className="absolute inset-x-0 top-1/2 h-px bg-[rgba(209,138,90,0.14)]" />
      <m.div style={{ transform: draw }} className="absolute inset-x-0 top-1/2 h-px origin-left bg-[linear-gradient(90deg,rgba(209,138,90,0.2),rgba(240,200,142,0.75))]" />
      {MARKS.map((d) => (
        <Mark key={d} progress={progress} day={d}>
          <span className="absolute -top-1 left-0 h-2.5 w-px bg-[#F0C88E]" />
        </Mark>
      ))}
    </m.div>
  );
}

function Mark({ progress, day, children }: { progress: MotionValue<number>; day: number; children: ReactNode }) {
  const opacity = useTransform(progress, (p) => r2(enter(seg(dayAt(p), day - 0.5, day + 0.5))));
  return (
    <m.span style={{ opacity, left: `${((day - 21) / (LAST_DAY - 21)) * 100}%` }} className="absolute top-1/2">
      {children}
    </m.span>
  );
}
