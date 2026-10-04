'use client';

import { useMotionValue, useMotionValueEvent, type MotionValue } from 'framer-motion';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
 * while its progress is inside (0, 1) its frames go to the stage. The stage
 * mounts only when the motion gate passes; static readers get each chapter's
 * own still figure instead.
 */
type Sky = { frame: MotionValue<SkyFrame>; layout: MotionValue<Layout> };

const SkyContext = createContext<Sky | null>(null);

export function SkyProvider({ levels, children }: { levels: readonly MapLayerLevel[]; children: ReactNode }) {
  const layout = useLayout();
  const frame = useMotionValue<SkyFrame>(prologue(0, layout.get()));
  const sky = useMemo(() => ({ frame, layout }), [frame, layout]);
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
  useEffect(() => {
    makeRef.current = make;
  });
  const publish = (p: number) => {
    if (!sky || p <= 0 || p >= 1) return;
    const f = makeRef.current(p, sky.layout.get());
    if (f) sky.frame.set(f);
  };
  useMotionValueEvent(progress, 'change', publish);
  useEffect(() => {
    publish(progress.get());
    // Once on mount: a deep link or a restore lands mid-chapter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
          map={<MapLayer levels={levels} />}
        />
      )}
    </div>
  );
}
