'use client';

import { useMotionValue, useMotionValueEvent } from 'framer-motion';
import { useEffect } from 'react';
import { DESCENT } from '../../data/strings/page-prologue';
import { Flare, LightSweep, Particles } from '../cinema/fx';
import { hud } from '../cinema/hud';
import { Subtitles } from '../cinema/shot';
import { Viewfinder } from '../cinema/viewfinder';
import { usePrologueProgress } from '../islands/prologue';
import { useMotionGate } from '../motion';

/**
 * The opening's film layers (05-cinema.md §1.7, §3 Prologue).
 *
 * (The hero's gear is the film itself now: scenes/hero-plate.tsx.)
 *
 * `HeroFilm`: particles, a light sweep, the landing flare, the reticle on
 * Mika's star and the two subtitles. Motion only. Her card, which opens out
 * of the star, lives with the sky's labels (sky/mika-card.tsx); while it is
 * up, the frame says "Illustrative".
 */

/** The film layers over the opening: motion only, so nothing here is in the static HTML. */
export function HeroFilm() {
  const progress = usePrologueProgress();
  const gate = useMotionGate();
  const fallback = useMotionValue(0);
  const p = progress ?? fallback;
  useMotionValueEvent(p, 'change', (v) => hud.illustrative('mika-card', v > 0.87 && v < 0.999));
  useEffect(() => () => hud.illustrative('mika-card', false), []);
  if (!gate.motion) return null;
  return (
    <>
      <LightSweep progress={p} from={0} to={0.18} />
      <Particles progress={p} push={[0.02, 0.42]} count={typeof window !== 'undefined' && window.innerWidth < 1024 ? 14 : 28} seed={11} />
      <Flare progress={p} from={0.78} to={1.05} x={50} y={50} size={460} />
      {/* The camera finds her: the viewfinder draws in and the focus box locks on her star. */}
      <Viewfinder progress={p} from={0.66} to={1.25} />
      <Subtitles
        progress={p}
        lines={[
          { text: DESCENT[0], from: 0.3, to: 0.58 },
          { text: DESCENT[1], from: 0.74, to: 1.08 },
        ]}
      />
    </>
  );
}
