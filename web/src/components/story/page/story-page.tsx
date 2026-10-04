import type { PlanInfo } from '@/api';
import { MEDIA } from '../media.generated';
import { Ch1 } from './chapters/ch1';
import { Ch10 } from './chapters/ch10';
import { Ch2 } from './chapters/ch2';
import { Ch3 } from './chapters/ch3';
import { Ch4 } from './chapters/ch4';
import { Ch5 } from './chapters/ch5';
import { Ch6 } from './chapters/ch6';
import { Ch7 } from './chapters/ch7';
import { Ch8 } from './chapters/ch8';
import { Ch9 } from './chapters/ch9';
import { Finale } from './chapters/finale';
import { Prologue } from './chapters/prologue';
import { TheWork } from './chapters/the-work';
import { mapLevels } from './map-levels';
import { Cuts, type Cut } from './cinema/cuts';
import { ScenePrefetch } from './cinema/prefetch';
import { SmoothScroll } from './cinema/smooth-scroll';
import { Frame } from './cinema/frame';
import { MotionRoot } from './motion';
import { PrePaint } from './pre-paint';
import { SkyProvider } from './sky-stage';
import './story.css';

/**
 * virgo.ph: "Every shoot is a constellation" (docs/redesign/02-storyboard.md).
 *
 * Server-rendered and complete: every chapter's copy, figures and links are in
 * the HTML in their final state, which is also the reduced-motion, no-JS and
 * crawler page. Chapter islands then play it as a film when the motion gate
 * allows (05-cinema.md). There is no header: the film plays inside a frame
 * (cinema/frame.tsx) whose corners hold the watermark, Sign in and Join, the
 * time card, and Download.
 */
export function StoryPage({ plans }: { plans: PlanInfo[] }) {
  return (
    <div className="story-page relative isolate min-h-svh bg-[#161311] text-[#F2EDE8] [overflow-x:clip]">
      <PrePaint />
      <MotionRoot>
        <SkyProvider levels={mapLevels()}>
          <a
            href="#features"
            className="sr-only z-[60] rounded-lg bg-[#F2EDE8] px-4 py-3 font-semibold text-[#161311] focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
          >
            Skip the film
          </a>
          <Frame />
          <main className="relative z-10">
            <Prologue />
            <Ch1 />
            <Ch2 />
            <Ch3 />
            <Ch4 />
            <Ch5 />
            <Ch6 />
            <Ch7 />
            <TheWork />
            <Ch8 />
            <Ch9 />
            <Ch10 plans={plans} />
            <Finale />
          </main>
          <Cuts cuts={CUTS} />
          <ScenePrefetch />
          <SmoothScroll cuts={CUTS} />
        </SkyProvider>
      </MotionRoot>
      <div aria-hidden className="story-grain" style={{ backgroundImage: `url(${MEDIA.grain.url})` }} />
    </div>
  );
}

/**
 * The cuts between scenes (05-cinema.md §1.8): a camera's own mechanisms,
 * never a symbol. The aperture closes and fires open; the focal-plane curtain
 * drops and runs off; a light leak washes over; or the frame falls into the
 * stars. Chapters that share the sky (Nearby → Connect, The work → Every
 * Saturday) flow on uncut.
 */
const CUTS: Cut[] = [
  // Off Mika's star: the aperture closes on the sky and opens on Wednesday night.
  { into: 'hire', kind: 'iris' },
  // Mika searches the map: the frame falls into the sky.
  { into: 'nearby', kind: 'warp' },
  // The booking made, Friday night: the shutter fires.
  { into: 'calendar', kind: 'curtain' },
  // Saturday, first light.
  { into: 'saturday', kind: 'leak' },
  { into: 'delivery', kind: 'iris' },
  // Day 91: the files leave, frame by frame.
  { into: 'forget', kind: 'curtain' },
  { into: 'features', kind: 'iris' },
];
