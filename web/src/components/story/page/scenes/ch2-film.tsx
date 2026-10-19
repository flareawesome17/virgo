'use client';

import { m, useTransform, type MotionValue } from 'framer-motion';
import { useState, type ReactNode } from 'react';
import { SEARCH_ROLES } from '../../data/story';
import { NEARBY, kmAway } from '../../data/strings/ch2';
import { CH2 } from '../../data/strings/page-ch2';
import { LocationCard } from '../../mocks/location-card';
import { enter, exit, r2, seg, window4 } from '../cinema/ease';
import { Flare, LightSweep, Particles, useCamera, useReveal } from '../cinema/fx';
import { Float } from '../cinema/float';
import { Illustrative, Shot, Slate, Subtitles, type Line } from '../cinema/shot';
import { Morph } from '../cinema/morph';
import { usePublishSky } from '../sky-stage';
import { NEARBY_AT, nearby } from '../sky/nearby';
import { CARD_KM, Field, KmChip, NEARBY_CARD, PersonRow, ROWS_25, RoleChip } from './ch2-nearby-card';
import { CH2_SHOT } from './ch2-timing';

/**
 * Ch2 · Thursday, 12:04 AM (05-cinema.md §3): one continuous shot over the
 * shared sky, which draws the radar (sky/nearby.ts); the shot's progress is
 * the sky's clock, so every beat here lands with NEARBY_AT.
 *
 *   0.00–0.16  out of the tunnel (cinema/cuts.tsx): a zoom in on the search card;
 *              the camera comes down to the shoot (wind); the 5 km ring opens
 *   0.16–0.47  the search card: the roles pick on with their tools, 5 km → 25 km (a sweep)
 *   0.48–0.71  who it finds, in whole kilometres; the sky smears stars into rings
 *   0.70–0.74  Share my location, on; a star 3 km out
 *   0.74       off: the star flares and is gone (the sky erases it in the same frame)
 *   0.86–1.00  the rings condense, the card pulls back, the sky holds for Ch3
 */

const SLATES: readonly Line[] = [{ text: CH2.slate, from: 0, to: 0.98 }];
const LINES: readonly Line[] = [
  { text: CH2.ask, from: 0.02, to: 0.2 },
  { text: CH2.pick, from: 0.22, to: 0.47 },
  { text: CH2.only, from: 0.5, to: 0.71 },
  { text: CH2.erase, from: 0.73, to: 0.96 },
];

/** When each role chip picks on. */
const PICK = [0.2, 0.23, 0.26] as const;
/** The card's faces: the search, then who it finds, then sharing. */
const FIND = 0.48;
const SHARE = 0.69;
const ERASE = NEARBY_AT.erase;

/** The card: right of the radar on desktop, under it on phones (clear of the subtitles' lower third). */
const ANCHOR = 'absolute left-1/2 top-[57%] w-[min(86vw,360px)] -translate-x-1/2 -translate-y-1/2 lg:left-[74%] lg:top-1/2 lg:w-[400px]';

export default function Ch2Film() {
  const [wide] = useState(() => window.innerWidth >= 1024);
  return <Shot length={CH2_SHOT}>{(progress) => <Frame progress={progress} wide={wide} />}</Shot>;
}

function Frame({ progress, wide }: { progress: MotionValue<number>; wide: boolean }) {
  // The radar is the sky's: publish its frames on this shot's clock.
  usePublishSky(progress, (p, l) => nearby(p, l));
  const tag = useTransform(progress, (p) => r2(window4(p, 0.04, 0.1, 0.92, 0.98)));
  return (
    <>
      <h2 className="sr-only">{CH2.ask}</h2>
      <ShootPin progress={progress} />
      <Particles progress={progress} push={[0, 0.16]} count={wide ? 20 : 10} seed={23} />
      <LightSweep progress={progress} from={0.34} to={0.5} warm={false} />
      <Card progress={progress} wide={wide} />
      <Slate progress={progress} slates={SLATES} />
      <m.div aria-hidden style={{ opacity: tag }} className="pointer-events-none absolute inset-0 z-30">
        <Illustrative />
      </m.div>
      <Subtitles progress={progress} lines={LINES} />
    </>
  );
}

/** Where the sky frames the shoot (sky/nearby.ts radarRig's shift): a third down on phones, the left of the frame on desktop. Approximate. */
const SHOOT = 'absolute left-1/2 top-[28%] lg:left-[29%] lg:top-1/2';

/**
 * The morph (cinema brief addendum 2): as the roles pick on, a small gold dot
 * over the shoot becomes a map pin (circle → pin), before the 25 km ring
 * opens. The pin is the shoot the distances are measured from, never a
 * person's position.
 */
function ShootPin({ progress }: { progress: MotionValue<number> }) {
  const { opacity, transform } = useReveal(progress, 0.16, 0.2, 0.86, 0.94, { y: 10, scale: 0.6 });
  return (
    <div aria-hidden className={`${SHOOT} pointer-events-none z-10 -translate-x-1/2 -translate-y-full`}>
      <m.div style={{ opacity, transform }} className="origin-bottom">
        <Morph
          progress={progress}
          keys={[
            { at: 0.2, shape: 'circle' },
            { at: 0.3, shape: 'pin' },
          ]}
          className="size-7"
        />
      </m.div>
    </div>
  );
}

/** A layer that is on over [a, b] with a short crossfade at each end. */
function useFace(progress: MotionValue<number>, a: number, b: number, fade = 0.025) {
  return useTransform(progress, (p) => r2(window4(p, a - fade, a, b - fade, b)));
}

/** Two stacked copies of a piece, off and on, crossfaded at `at`. */
function Flip({
  progress,
  at,
  off,
  on,
  until = 2,
  className = 'inline-grid',
}: {
  progress: MotionValue<number>;
  at: number;
  until?: number;
  off: ReactNode;
  on: ReactNode;
  className?: string;
}) {
  const o = useTransform(progress, (p) => r2(seg(p, at, at + 0.015) * (1 - seg(p, until, until + 0.015))));
  const f = useTransform(o, (v) => r2(1 - v));
  return (
    <span className={className}>
      <m.span style={{ opacity: f }} className="col-start-1 row-start-1">
        {off}
      </m.span>
      <m.span aria-hidden style={{ opacity: o }} className="col-start-1 row-start-1">
        {on}
      </m.span>
    </span>
  );
}

function Card({ progress, wide }: { progress: MotionValue<number>; wide: boolean }) {
  const transform = useCamera(progress, [
    { at: 0, scale: 0.56, y: 10, rx: 18, ry: -26 },
    { at: 0.08, scale: 0.84, y: 4, rx: 12, ry: -16 },
    { at: 0.24, scale: 1, rx: 6, ry: -10 },
    { at: 0.46, scale: 1, rx: 4, ry: 6 },
    { at: 0.7, scale: 1.04, rx: 2, ry: -6 },
    { at: 0.88, scale: 1, rx: 4, ry: 8 },
    { at: 0.98, scale: 0.6, y: -14, rx: 14, ry: 12 },
  ]);
  const opacity = useTransform(progress, (p) => r2((0.5 + 0.5 * enter(seg(p, 0, 0.06))) * (1 - exit(seg(p, 0.88, 0.97)))));
  const search = useFace(progress, 0, FIND);
  const found = useFace(progress, FIND + 0.025, SHARE);
  const sharing = useFace(progress, SHARE + 0.025, 1.1);
  const rowCount = wide ? 4 : 3;
  return (
    <div className={`${ANCHOR} z-10`}>
      <Star progress={progress} />
      <m.div style={{ transform, opacity }}>
        <Float className="grid" amp={7} tilt={1.8} duration={6.8}>
          {/* The search: roles with their tools, then the distance. */}
          <m.div style={{ opacity: search }} className={`col-start-1 row-start-1 ${NEARBY_CARD}`}>
            <Field label={NEARBY.lookingFor}>
              <div className="flex flex-wrap gap-2">
                {SEARCH_ROLES.map((r, i) => (
                  <Item key={r} progress={progress} at={0.02 + i * 0.035} out={FIND - 0.07 + i * 0.012}>
                    <Flip progress={progress} at={PICK[i]} off={<RoleChip role={r} on={false} />} on={<RoleChip role={r} on />} />
                  </Item>
                ))}
              </div>
            </Field>
            <div className="mt-4">
              <Field label={NEARBY.within}>
                <div className="flex flex-wrap gap-2">
                  {CARD_KM.map((km, i) => (
                    <Item key={km} progress={progress} at={0.08 + i * 0.035} out={FIND - 0.05 + i * 0.012}>
                      <Flip
                        progress={progress}
                        at={km === 5 ? NEARBY_AT.r5 : km === 25 ? NEARBY_AT.r25 : 2}
                        until={km === 5 ? NEARBY_AT.r25 : 2}
                        off={<KmChip km={km} on={false} />}
                        on={<KmChip km={km} on />}
                      />
                    </Item>
                  ))}
                </div>
              </Field>
            </div>
          </m.div>

          {/* Who it finds: a name, the work, and how far. Nothing else. */}
          <m.div style={{ opacity: found }} className={`col-start-1 row-start-1 ${NEARBY_CARD}`}>
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#A08E84]">
              {NEARBY.within} {CARD_KM[1]} km
            </p>
            <div className="mt-2">
              {ROWS_25.slice(0, rowCount).map((n, i) => (
                <Row key={n.name} progress={progress} at={FIND + 0.03 + i * 0.03} out={SHARE - 0.06 + i * 0.01}>
                  <PersonRow n={n} />
                </Row>
              ))}
            </div>
          </m.div>

          {/* Sharing: on, then off. */}
          <m.div aria-hidden style={{ opacity: sharing }} className="col-start-1 row-start-1 self-start">
            <div>
              <Flip
                className="grid w-full"
                progress={progress}
                at={ERASE}
                off={<LocationCard platform="phone" state="on" className="w-full" />}
                on={<LocationCard platform="phone" state="off" className="w-full" />}
              />
            </div>
          </m.div>
        </Float>
      </m.div>
    </div>
  );
}

/** An item that eases in over [at, at + 0.045] and out over [out, out + 0.03] (useReveal). */
function Item({ progress, at, out, children }: { progress: MotionValue<number>; at: number; out: number; children: ReactNode }) {
  const { opacity, transform } = useReveal(progress, at, at + 0.045, out, out + 0.03, { y: 14 });
  return (
    <m.span style={{ opacity, transform }} className="inline-flex">
      {children}
    </m.span>
  );
}

function Row({ progress, at, out, children }: { progress: MotionValue<number>; at: number; out: number; children: ReactNode }) {
  const { opacity, transform } = useReveal(progress, at, at + 0.045, out, out + 0.03, { y: 16 });
  return (
    <m.div style={{ opacity, transform }} className="border-t border-[#2A2522] first:border-t-0">
      {children}
    </m.div>
  );
}

/**
 * The erase: a star 3 km out, over the card, while sharing is on. At the
 * switch it flares and is gone in one frame, with nothing left where it was.
 */
function Star({ progress }: { progress: MotionValue<number> }) {
  const { transform } = useReveal(progress, SHARE, SHARE + 0.035, 2, 3, { y: 12, scale: 0.6 });
  // Erased, not hidden: no fade out. It is there, then it is not.
  const opacity = useTransform(progress, (p) => (p >= ERASE ? 0 : r2(window4(p, SHARE, SHARE + 0.035, 2, 3))));
  return (
    <div aria-hidden className="pointer-events-none absolute -top-16 right-[14%] z-20 size-0">
      <m.span style={{ opacity, transform }} className="absolute -left-2 -top-2 flex origin-left items-center gap-3">
        <span className="block size-4 shrink-0 rounded-full bg-[#FFE7C2] shadow-[0_0_22px_8px_rgba(240,200,142,0.5)]" />
        <span className="whitespace-nowrap font-mono text-[15px] tabular-nums text-[#F0C88E]">{kmAway(3)}</span>
      </m.span>
      <Flare progress={progress} from={ERASE - 0.005} to={ERASE + 0.09} x={0} y={0} size={340} />
    </div>
  );
}
