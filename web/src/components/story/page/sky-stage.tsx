'use client';

import { useMotionValue, useMotionValueEvent, type MotionValue } from 'framer-motion';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CAST_STARS, STARS, type StarId } from '../data/constellation';
import { CAST } from '../data/story';
import { MapLayer, type MapLayerLevel } from '../sky/map-layer';
import { SkyCanvas } from '../sky/sky-canvas';
import type { SkyFrame } from '../sky/types';
import { useLayout, useMotionGate } from './motion';
import { prologue, type Layout } from './sky/choreography';

/**
 * One sky for the whole page (storyboard §1.3): fixed, behind the chapters,
 * driven by whichever sky chapter is in play.
 *
 * A chapter island publishes frames with `usePublishSky(progress, make)`:
 * while its progress is inside (0, 1) its frames go to the stage, and the sky
 * counts as live (shooting stars cross only a live sky). The stage mounts only
 * when the motion gate passes; static readers get each chapter's own still
 * figure instead.
 *
 * The stage also carries the labels the choreography pins to people's stars:
 * Mika's as the Prologue lands on her, and (desktop) the cast's names as
 * Ch3's Virgo forms. Only their translate and opacity ever change.
 */
type Sky = {
  frame: MotionValue<SkyFrame>;
  layout: MotionValue<Layout>;
  live: MotionValue<boolean>;
  /** A publisher saying whether it is showing the sky. */
  claim: (who: object, on: boolean) => void;
};

const SkyContext = createContext<Sky | null>(null);

export function SkyProvider({ levels, children }: { levels: readonly MapLayerLevel[]; children: ReactNode }) {
  const layout = useLayout();
  const frame = useMotionValue<SkyFrame>(prologue(0, layout.get()));
  const live = useMotionValue(false);
  const [owners] = useState(() => new Set<object>());
  const sky = useMemo<Sky>(
    () => ({
      frame,
      layout,
      live,
      claim: (who, on) => {
        if (on === owners.has(who)) return;
        if (on) owners.add(who);
        else owners.delete(who);
        live.set(owners.size > 0);
      },
    }),
    [frame, layout, live, owners],
  );
  return (
    <SkyContext.Provider value={sky}>
      <SkyBackdrop levels={levels} />
      {children}
    </SkyContext.Provider>
  );
}

/** Publishes a chapter's sky while it is in play. `make` must be cheap: it runs on every scroll frame of the chapter. */
export function usePublishSky(progress: MotionValue<number>, make: (p: number, layout: Layout) => SkyFrame | null) {
  const sky = useContext(SkyContext);
  const makeRef = useRef(make);
  const [me] = useState(() => ({}));
  useEffect(() => {
    makeRef.current = make;
  });
  const publish = (p: number) => {
    if (!sky) return;
    if (p <= 0 || p >= 1) {
      sky.claim(me, false);
      return;
    }
    const f = makeRef.current(p, sky.layout.get());
    if (f) sky.frame.set(f);
    sky.claim(me, !!f);
  };
  useMotionValueEvent(progress, 'change', publish);
  useEffect(() => {
    publish(progress.get());
    // Once on mount: a deep link or a restore lands mid-chapter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // A chapter that unmounts mid-sky lets go of it.
  useEffect(() => () => sky?.claim(me, false), [sky, me]);
}

function SkyBackdrop({ levels }: { levels: readonly MapLayerLevel[] }) {
  const sky = useContext(SkyContext);
  const gate = useMotionGate();
  const [frozen, setFrozen] = useState(false);
  if (!sky) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 -z-0 h-lvh bg-[radial-gradient(120%_80%_at_50%_100%,#1E1A17_0%,#161311_45%,#0E0C0B_100%)]"
      data-part="sky-stage"
    >
      {gate.motion && !frozen && (
        <SkyCanvas
          frame={sky.frame}
          variant={gate.lite ? 'lite' : 'auto'}
          onFreeze={() => setFrozen(true)}
          live={sky.live}
          map={<MapLayer levels={levels} />}
          labels={<SkyLabels />}
        />
      )}
    </div>
  );
}

// ─── Labels on people's stars ────────────────────────────────────────────

const MONO = 'font-mono text-[11px] leading-none tracking-[0.08em] whitespace-nowrap sm:text-xs';

/** "Mika · Spica", "Ernie · Porrima", …: who each of the cast became in Ch3, as the static chart names them. */
const CAST_LABELS = (Object.keys(CAST_STARS) as (keyof typeof CAST_STARS)[]).map((who) => {
  const star = STARS.find((s) => s.id === CAST_STARS[who])!;
  return { star: star.id, text: `${CAST[who].first} · ${star.label}` };
});

/** Where each cast label sits against its star, so Heze and Porrima (close on the sky) never collide. */
const CAST_SIDE: Partial<Record<StarId, string>> = {
  alpha: '-translate-x-1/2 translate-y-[16px]',
  gamma: 'translate-x-[12px] translate-y-[8px]',
  epsilon: '-translate-x-1/2 -translate-y-[calc(100%+16px)]',
  zeta: '-translate-x-[calc(100%+12px)] -translate-y-[calc(100%+6px)]',
};

/**
 * The label elements the choreography may pin (`[data-sky-label]`): each
 * starts hidden and the engine moves it onto its star by translate only.
 * Mika's sits below the viewfinder's focus box (56 px, 80 px from sm), so the
 * box locks on her star and her name reads under it.
 */
function SkyLabels() {
  return (
    <>
      <div data-sky-label="mika-chip" className="absolute left-0 top-0 opacity-0">
        <div className={`-translate-x-1/2 translate-y-[42px] rounded-full border border-[#F0C88E]/35 bg-[#161311]/[0.86] px-3 py-1.5 text-[#F2EDE8] sm:translate-y-[54px] ${MONO}`}>
          {CAST.mika.first} · {CAST.mika.roles[0]}
        </div>
      </div>
      {CAST_LABELS.map(({ star, text }) => (
        <div key={star} data-sky-label={`cast-${star}`} className="absolute left-0 top-0 opacity-0">
          <div className={`${CAST_SIDE[star] ?? ''} text-[#F2EDE8] [text-shadow:0_1px_8px_#161311,0_0_2px_#161311] ${MONO}`}>{text}</div>
        </div>
      ))}
    </>
  );
}
