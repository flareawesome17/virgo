'use client';

import { m, useMotionValueEvent, useTransform, type MotionValue } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { WORK_COPY } from '../../data/strings/page-work';
import { ShowcaseCard } from '../../mocks/showcase-card';
import type { SkyFrame } from '../../sky/types';
import { camera, enter, lerp, r2, seg, window4 } from '../cinema/ease';
import { LightSweep, Particles, useCamera, useReveal } from '../cinema/fx';
import { Float } from '../cinema/float';
import { GearArt, type GearKind } from '../cinema/gear';
import { Illustrative, Shot, Slate, Subtitles, type Line } from '../cinema/shot';
import { Viewfinder } from '../cinema/viewfinder';
import { useNarrow } from '../islands/ch7';
import { usePublishSky } from '../sky-stage';
import { crane, type Layout } from '../sky/choreography';

/**
 * The work · #the-work, the film (05-cinema.md §3). One shot, between two
 * seams with no central cut: it opens out of Ch7's gold leak and ends by
 * pulling back to the shared sky, which Ch8 cranes up from.
 *
 *   0.00–0.16  The leak clears over a flat-lay seen from above; the table,
 *              the kit (camera, lens, light) and the showcase card ease in,
 *              staggered.
 *   0.10–0.70  "Show the work. Say how you made it."  The camera cranes up
 *              and in until the card faces us; it lifts off the table; the
 *              viewfinder frames it and locks focus (0.28–0.68); HOW IT WAS
 *              MADE reveals and the craft tags tick on (0.34–0.55); a light
 *              sweep crosses it (0.30–0.62).
 *   0.68–1.00  The pull back to the sky: the kit eases out, the card shrinks
 *              into a point of light over Mika's star, and the dark lifts off
 *              the shared sky (held where Ch8's crane starts).
 *
 * Product truth: showcases are seen by signed-in members only; the card's
 * words are the app's. The kit is scenery, not a feature (no gear list).
 */

const LINES: readonly Line[] = [{ text: WORK_COPY.title, from: 0.1, to: 0.7, small: WORK_COPY.small }];
const SLATES: readonly Line[] = [{ text: WORK_COPY.slate, from: 0.02, to: 0.8 }];

const CAMERA = [
  { at: 0, scale: 0.7, rx: 52, ry: 0, y: 3 },
  { at: 0.32, scale: 0.94, rx: 26, ry: -8, y: 1 },
  { at: 0.56, scale: 1.02, rx: 10, ry: -5 },
  { at: 0.74, scale: 1.05, rx: 6, ry: 4 },
  { at: 1, scale: 0.9, rx: 10, ry: 8, y: 9 },
] as const;

/** Ch7's leak, the same centred radial, so the two stages meet without a seam. */
const LEAK = 'bg-[radial-gradient(120%_90%_at_50%_50%,#E2AC74_0%,#9C6038_55%,#4A2C1C_100%)]';

/** The card's design width, px; the whole flat-lay scales to fit the viewport from here. */
const CARD_W = 300;
/** About the card's height at CARD_W (the cover is 1.15× its width, plus the placard). */
const CARD_H = 600;

/** The kit on the table, around the card (percentages of the card's box): phones keep it closer in. */
const KIT: readonly { kind: GearKind; className: string }[] = [
  { kind: 'camera', className: '-left-[42%] top-[12%] w-[52%] -rotate-[14deg] lg:-left-[66%] lg:w-[60%]' },
  { kind: 'lens', className: '-right-[30%] top-[58%] w-[36%] rotate-[8deg] lg:-right-[48%] lg:w-[42%]' },
  { kind: 'light', className: '-right-[24%] -top-[10%] w-[26%] rotate-[10deg] lg:-right-[44%] lg:w-[30%]' },
];

/** Scales the flat-lay so the card fits above the subtitles. React state on resize only. */
function useFit() {
  const [k, setK] = useState(0.7);
  useEffect(() => {
    const update = () => setK(Math.max(0.5, Math.min(1.05, (window.innerHeight * 0.56) / CARD_H, (window.innerWidth * 0.62) / CARD_W)));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return k;
}

type Craft = { note: HTMLElement | null; tags: HTMLElement[] };

/** HOW IT WAS MADE: the note, then the tags, eased onto the card's own parts. */
function reveal(p: number, card: HTMLElement | null, craft: Craft) {
  if (!card) return;
  if (!craft.note) {
    craft.note = card.querySelector<HTMLElement>('[data-part="craft-note"]');
    craft.tags = [...card.querySelectorAll<HTMLElement>('[data-part="craft-tag"]')];
  }
  if (craft.note) craft.note.style.opacity = String(r2(enter(seg(p, 0.34, 0.44))));
  craft.tags.forEach((el, i) => {
    const k = enter(seg(p, 0.42 + i * 0.035, 0.48 + i * 0.035));
    el.style.opacity = String(r2(k));
    el.style.transform = `scale(${r2(0.9 + 0.1 * k)})`;
  });
}

export function WorkScene({ length }: { length: number }) {
  return (
    <Shot length={length} overlap>
      {(progress) => <Frame progress={progress} />}
    </Shot>
  );
}

function Frame({ progress }: { progress: MotionValue<number> }) {
  const narrow = useNarrow();
  const fit = useFit();
  const card = useRef<HTMLDivElement>(null);
  const craft = useRef<Craft>({ note: null, tags: [] });
  const landed = useRef<{ key: string; frame: SkyFrame | null }>({ key: '', frame: null });

  // While pinned, hold the sky where Ch8's crane starts (over Mika, Cebu City), so the pull back lands on it.
  usePublishSky(progress, (_p, l: Layout) => {
    const key = `${l.w}x${l.h}${l.mobile ? 'm' : ''}`;
    if (landed.current.key !== key) landed.current = { key, frame: crane(0, l, false) };
    return landed.current.frame;
  });

  useMotionValueEvent(progress, 'change', (p) => reveal(p, card.current, craft.current));
  useEffect(() => {
    reveal(progress.get(), card.current, craft.current);
  }, [progress]);

  const rig = useCamera(progress, CAMERA);
  const scrim = useTransform(progress, (p) => r2(1 - camera(seg(p, 0.68, 0.94))));
  const leakIn = useTransform(progress, (p) => r2(1 - camera(seg(p, 0.02, 0.16))));
  const lamp = useTransform(progress, (p) => r2(0.9 * (1 - seg(p, 0.66, 0.86))));
  const table = useReveal(progress, 0.02, 0.1, 0.7, 0.82, { y: 0, scale: 0.94 });
  const cardIn = useReveal(progress, 0.06, 0.16, 2, 3, { y: 30, scale: 0.92 });
  const cardT = useTransform(progress, (p) => {
    const lift = lerp(8, 46, camera(seg(p, 0.12, 0.5)));
    const go = camera(seg(p, 0.74, 0.94));
    return `translate3d(0,0,${r2(lift * (1 - go))}px) scale(${r2(lerp(1, 0.03, go))})`;
  });
  const cardO = useTransform(progress, (p) => r2(1 - seg(p, 0.86, 0.95)));
  const star = useTransform(progress, (p) => r2(window4(p, 0.84, 0.9, 0.95, 1)));

  return (
    <>
      {/* (a) The dark of the room, lifting off the shared sky at the end. */}
      <m.div aria-hidden style={{ opacity: scrim }} className="pointer-events-none absolute inset-0 bg-[#161311]" />
      {/* (b) A warm lamp over the table. */}
      <m.div
        aria-hidden
        style={{ opacity: lamp }}
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_38%,rgba(240,200,142,0.16),rgba(240,200,142,0)_70%)]"
      />

      {/* (c) The flat-lay: the card and the kit on one table plane, under one camera. */}
      <div className="absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2" style={{ width: CARD_W, scale: fit }}>
        <m.div aria-hidden style={{ transform: rig, transformStyle: 'preserve-3d' }} className="relative">
          <m.div style={{ transform: 'translateZ(-2px)' }} className="absolute inset-0">
            <m.div
              style={{ opacity: table.opacity, transform: table.transform }}
              className="absolute -inset-x-[80%] -inset-y-[35%] bg-[radial-gradient(closest-side,rgba(42,36,32,0.95),rgba(42,36,32,0))]"
            />
            {KIT.map(({ kind, className }, i) => (
              <KitPiece key={kind} progress={progress} kind={kind} className={className} i={i} />
            ))}
          </m.div>

          <m.div ref={card} style={{ transform: cardT, opacity: cardO }} className="relative">
            <Float amp={7} tilt={1.8} duration={7}>
              <m.div
                style={{ opacity: cardIn.opacity, transform: cardIn.transform }}
                className="overflow-hidden rounded-[22px] shadow-[0_40px_80px_-28px_rgba(0,0,0,0.95)] ring-1 ring-[rgba(242,237,232,0.12)]"
              >
                <ShowcaseCard pieces={3} />
              </m.div>
            </Float>
          </m.div>

          <m.span
            style={{ opacity: star, transform: 'translateZ(1px)' }}
            className="pointer-events-none absolute left-1/2 top-1/2 -ml-2 -mt-2 size-4 rounded-full bg-[#FFF4E4] shadow-[0_0_16px_6px_rgba(247,217,176,0.65),0_0_48px_16px_rgba(209,138,90,0.35)]"
          />
        </m.div>
      </div>

      {/* Through the lens: the viewfinder finds the card and locks focus as it faces us. */}
      <Viewfinder progress={progress} from={0.28} to={0.68} focus={{ x: 50, y: 40 }} />

      {/* (d) Dust toward the camera as it cranes in; a sweep across the card once it faces us. */}
      <Particles progress={progress} push={[0.02, 0.6]} count={narrow ? 8 : 16} seed={23} />
      <LightSweep progress={progress} from={0.3} to={0.62} />
      <m.div aria-hidden style={{ opacity: leakIn }} className={`pointer-events-none absolute inset-0 z-20 ${LEAK}`} />

      <Slate progress={progress} slates={SLATES} />
      <m.div style={{ opacity: scrim }}>
        <Illustrative />
      </m.div>
      <Subtitles progress={progress} lines={LINES} />
    </>
  );
}

/** One piece of the kit, set down on the table in turn and picked up again as the camera pulls away. */
function KitPiece({ progress, kind, className, i }: { progress: MotionValue<number>; kind: GearKind; className: string; i: number }) {
  const r = useReveal(progress, 0.04 + i * 0.04, 0.12 + i * 0.04, 0.68 + i * 0.03, 0.8 + i * 0.03, { y: 18, scale: 0.9 });
  return (
    <div className={`absolute ${className}`}>
      <m.div style={{ opacity: r.opacity, transform: r.transform }} className="relative">
        <div className="absolute -inset-[8%] top-[20%] bg-[radial-gradient(closest-side,rgba(0,0,0,0.6),rgba(0,0,0,0))]" />
        <GearArt kind={kind} className="relative block h-auto w-full" />
      </m.div>
    </div>
  );
}
