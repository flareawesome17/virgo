'use client';

import { m, motionValue, type MotionValue } from 'framer-motion';
import { useEffect, useMemo, useRef } from 'react';
import { CH8_COPY } from '../../data/strings/page-ch8';
import { project, smoothstep, span, view, type Projected, type View } from '../../sky/camera';
import type { SkyFrame } from '../../sky/types';
import { enter, r2, seg } from '../cinema/ease';
import { Flare } from '../cinema/fx';
import { GearArt, type GearKind } from '../cinema/gear';
import { Morph, type MorphKey } from '../cinema/morph';
import { Shot, Slate, Subtitles, type Line } from '../cinema/shot';
import { useChapterProgress } from '../motion';
import { usePublishSky } from '../sky-stage';
import { clustersFor, crane, type Layout } from '../sky/choreography';

/**
 * Ch8 · Every Saturday · #community, the film (05-cinema.md §3). The sky is
 * the stage: the pull back from Cebu City to the whole archipelago, the
 * small constellations lighting north to south (the shared sky's `crane`).
 *
 * The crane runs on the whole track's `cover` progress, so it is already
 * moving while The work's stage hands over (that seam has no central cut):
 * from ~55% of the way to the pin until the pin lets go. It ends wide.
 *
 * Shot (track progress):
 *   0.04–0.46  "Somewhere tonight, a crew like this one."
 *   0.52–end   "A creative industry is a people business."  (held; the
 *              central iris into #features takes the frame)
 *   ~0.3–0.9   As the wave reaches four crews' cities, a pin drops on each
 *              and morphs into a star (pin → sparkle); its tool eases in and
 *              twinkles beside it; gold constellation lines draw between
 *              them. A soft flare blooms on the second line.
 *
 * Glyphs and lines are placed by projecting the same crane frame the sky
 * draws (written to MotionValues on the sky's own frame callback), so they
 * sit on the stars. Compositor-only: transform and opacity.
 */

const LINES: readonly Line[] = [
  { text: CH8_COPY.lines[0], from: 0.04, to: 0.46 },
  { text: CH8_COPY.lines[1], from: 0.52, to: 1.3 },
];
const SLATES: readonly Line[] = [{ text: CH8_COPY.slate, from: 0, to: 1.3 }];

/** Four crews, one tool each (ROLE_GEAR's roles), north to south; all four are in both the phone and desktop cluster lists. */
const GLYPHS: readonly { city: string; kind: GearKind; delay: number }[] = [
  { city: 'Baguio', kind: 'camera', delay: 0 },
  { city: 'Iloilo City', kind: 'cinema', delay: 1.1 },
  { city: 'Cagayan de Oro', kind: 'brush', delay: 0.5 },
  { city: 'Davao City', kind: 'timeline', delay: 1.7 },
];
/** The constellation lines between the crews. */
const LINKS: readonly (readonly [number, number])[] = [
  [0, 1],
  [1, 2],
  [2, 3],
];

/** A pin, then a star (the morph's progress is how lit the crew's cluster is). */
const PIN_TO_STAR: readonly MorphKey[] = [
  { at: 0.2, shape: 'pin' },
  { at: 0.85, shape: 'sparkle' },
];

const TWINKLE = `
@keyframes c8-twinkle{0%,100%{opacity:.6;transform:scale(.96)}50%{opacity:1;transform:scale(1.04)}}
.c8-twinkle{animation:c8-twinkle 3.6s ease-in-out infinite}
`;

type Timing = { H: number; V: number; pinStart: number; pinEnd: number; from: number; skyW: number; skyH: number };
type Point = Projected & { lit: number; ok: boolean };
type Mv = { t: MotionValue<string>; o: MotionValue<number> };
/** A crew's marker: where it is, how lit its cluster is (the morph's progress), and the pin's and the tool's opacity. */
type Glyph = Mv & { lit: MotionValue<number>; mk: MotionValue<number> };

const HIDDEN = 'translate3d(-200px,-200px,0)';

export function Ch8Scene({ length }: { length: number }) {
  const wrap = useRef<HTMLDivElement>(null);
  const cover = useChapterProgress(wrap, 'cover');
  const timing = useRef<Timing>({ H: 1, V: 1, pinStart: 1 / 3, pinEnd: 2 / 3, from: 0.18, skyW: 0, skyH: 0 });
  const buf = useRef<{ v: Partial<View>; pts: Point[] }>({
    v: {},
    pts: GLYPHS.map(() => ({ x: 0, y: 0, depth: 0, lit: 0, ok: false })),
  });
  const glyphs = useMemo<Glyph[]>(() => GLYPHS.map(() => ({ t: motionValue(HIDDEN), o: motionValue(0), lit: motionValue(0), mk: motionValue(0) })), []);
  const links = useMemo<Mv[]>(() => LINKS.map(() => ({ t: motionValue(HIDDEN), o: motionValue(0) })), []);

  // Measured before the sky's first publish (effects run in order).
  useEffect(() => {
    const measure = () => {
      const el = wrap.current;
      if (!el) return;
      const H = el.offsetHeight;
      const V = window.innerHeight;
      const sky = document.querySelector<HTMLElement>('.story-page [data-part="sky-stage"]');
      const pinStart = V / (H + V);
      // The chapter overlaps The work by a screen, so the crane starts as it pins, from where The work held the sky.
      timing.current = { H, V, pinStart, pinEnd: H / (H + V), from: pinStart, skyW: sky?.clientWidth ?? 0, skyH: sky?.clientHeight ?? 0 };
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  usePublishSky(cover, (c, l) => {
    const t = timing.current;
    // Until it pins, The work still owns the sky.
    if (c < t.from) return null;
    const r = seg(c, t.from, t.pinEnd);
    const frame = crane(r, l, false);
    place(frame, r, c, l, t, buf.current, glyphs, links);
    return frame;
  });

  return (
    <div ref={wrap}>
      <Shot length={length} overlap>
        {(progress) => <Frame progress={progress} glyphs={glyphs} links={links} />}
      </Shot>
    </div>
  );
}

/** Projects the four crews' stars through the crane's camera and moves the glyphs and lines onto them. */
function place(frame: SkyFrame, r: number, c: number, l: Layout, t: Timing, buf: { v: Partial<View>; pts: Point[] }, glyphs: Glyph[], links: Mv[]) {
  const cam = frame.geo?.camera;
  if (!cam) return;
  const v = view(cam, t.skyW || l.w, t.skyH || l.h, buf.v);
  // The stage's top against the viewport's: below it before the pin, above it after.
  const total = t.H + t.V;
  const top = c < t.pinStart ? (t.pinStart - c) * total : c > t.pinEnd ? -(c - t.pinEnd) * total : 0;
  const list = clustersFor(l);
  const wave = span(r, 0.3, 0.7);
  GLYPHS.forEach((g, i) => {
    const pt = buf.pts[i];
    const cluster = list.find((k) => k.city === g.city);
    pt.ok = false;
    if (!cluster) return;
    const [x, y, z] = cluster.stars[0];
    project(v, x, y, z, pt);
    pt.ok = pt.depth > 0 && Number.isFinite(pt.x);
    pt.y -= top;
    pt.lit = smoothstep(cluster.wave * 0.72 + 0.12, cluster.wave * 0.72 + 0.4, wave);
    const mv = glyphs[i];
    if (!pt.ok) {
      mv.o.set(0);
      mv.mk.set(0);
      return;
    }
    mv.t.set(`translate3d(${r2(pt.x)}px,${r2(pt.y)}px,0)`);
    mv.lit.set(r2(pt.lit));
    // The pin drops in first; the tool eases in once its crew has lit.
    mv.mk.set(r2(Math.min(1, pt.lit * 3)));
    mv.o.set(r2(seg(pt.lit, 0.45, 1)));
  });
  LINKS.forEach(([a, b], j) => {
    const A = buf.pts[a];
    const B = buf.pts[b];
    const mv = links[j];
    if (!A.ok || !B.ok) {
      mv.o.set(0);
      return;
    }
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const draw = enter(Math.min(A.lit, B.lit));
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    mv.t.set(`translate3d(${r2(A.x)}px,${r2(A.y)}px,0) rotate(${r2(angle)}deg) scaleX(${r2(Math.max(0.01, Math.hypot(dx, dy) * draw))})`);
    mv.o.set(r2(0.45 * draw));
  });
}

function Frame({ progress, glyphs, links }: { progress: MotionValue<number>; glyphs: Glyph[]; links: Mv[] }) {
  return (
    <>
      <style>{TWINKLE}</style>
      {/* Geometry: gold constellation lines between the crews, drawn as the wave reaches them. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-10">
        {links.map((mv, i) => (
          <m.span
            key={i}
            style={{ transform: mv.t, opacity: mv.o }}
            className="absolute left-0 top-0 h-px w-px origin-left bg-[linear-gradient(90deg,rgba(240,200,142,0.9),rgba(209,138,90,0.6))]"
          />
        ))}
        {/* The tools of the trade, twinkling beside their crews' stars. */}
        {glyphs.map((mv, i) => {
          const g = GLYPHS[i];
          return (
            <m.div key={g.city} style={{ transform: mv.t }} className="absolute left-0 top-0">
              {/* The morph: a crew's pin becomes a star as its cluster lights. */}
              <m.div style={{ opacity: mv.mk }} className="absolute -left-[9px] -top-[13px] size-[18px]">
                <Morph progress={mv.lit} keys={PIN_TO_STAR} className="block size-full" />
              </m.div>
              <m.span style={{ opacity: mv.o }} className="absolute left-[12px] top-[-50px] block">
                <span
                  style={{ animationDelay: `${g.delay}s` }}
                  className="c8-twinkle autoplay block rounded-lg bg-[rgba(22,19,17,0.62)] p-1.5 ring-1 ring-[rgba(209,138,90,0.35)]"
                >
                  <GearArt kind={g.kind} className="block h-[34px] w-auto" />
                </span>
              </m.span>
            </m.div>
          );
        })}
      </div>

      <Flare progress={progress} from={0.48} to={0.82} x={50} y={46} size={640} />
      <Slate progress={progress} slates={SLATES} />
      <Subtitles progress={progress} lines={LINES} />
    </>
  );
}
