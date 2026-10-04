import Image from 'next/image';
import type { PlanInfo } from '@/api';
import { SIGN_IN_URL } from '@/components/landing/links';
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
import { Faq } from './chapters/faq';
import { Finale } from './chapters/finale';
import { StoryFooter } from './chapters/footer';
import { Prologue } from './chapters/prologue';
import { TheWork } from './chapters/the-work';
import { mapLevels } from './map-levels';
import { DownloadPill, Letterbox, Scrubber } from './cinema/chrome';
import { Cuts, type Cut } from './cinema/cuts';
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
 * allows (05-cinema.md). There is no header: the frame is a title bar that
 * scrolls away with the opening, one Download pill, a scrubber and letterbox.
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
          <TitleBar />
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
            <Faq />
          </main>
          <StoryFooter />
          <Cuts cuts={CUTS} />
          <Letterbox />
          <Scrubber />
          <DownloadPill />
        </SkyProvider>
      </MotionRoot>
      <div aria-hidden className="story-grain" style={{ backgroundImage: `url(${MEDIA.grain.url})` }} />
    </div>
  );
}

/**
 * The cuts between scenes (05-cinema.md §1.8): the aperture closes and opens,
 * a zoom through a geometric tunnel, or a warm light leak, with the story's
 * symbol morphing at the centre: Mika's star → the group chat, the job → a pin,
 * the constellation → the calendar, the alarm → the sun, the shutter → a heart,
 * the heart → an hourglass, the stars → the aperture. Chapters that share
 * the sky (Nearby → Connect, The work → Every Saturday) flow on uncut.
 */
const CUTS: Cut[] = [
  { into: 'hire', kind: 'iris', from: 'sparkle', to: 'bubble' },
  { into: 'nearby', kind: 'tunnel', from: 'square', to: 'pin' },
  { into: 'calendar', kind: 'iris', from: 'sparkle', to: 'square' },
  { into: 'saturday', kind: 'leak', from: 'circle', to: 'sun' },
  { into: 'delivery', kind: 'iris', from: 'hexagon', to: 'heart' },
  { into: 'forget', kind: 'tunnel', from: 'heart', to: 'hourglass' },
  { into: 'features', kind: 'iris', from: 'sparkle', to: 'hexagon' },
];

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[#F2EDE8]';

/** The opening title card's corners: the mark and Sign in. It scrolls away with the opening; nothing follows. */
function TitleBar() {
  return (
    <div className="absolute inset-x-0 top-0 z-50 flex items-center justify-between px-5 pt-5 sm:px-8 sm:pt-7 lg:pt-[max(1.25rem,calc(min(11vh,max(0px,calc((100vh_-_100vw/2.39)/2)))/2_-_1.375rem))]">
      <a href="#top" aria-label="Virgo, back to the top" className={`inline-flex min-h-11 items-center gap-2.5 rounded-lg text-[17px] font-semibold tracking-[-0.01em] text-[#F2EDE8] ${FOCUS}`}>
        <Image src="/logo.png" alt="" width={28} height={28} className="size-7" priority />
        Virgo
      </a>
      <a href={SIGN_IN_URL} className={`inline-flex min-h-11 items-center rounded-lg px-1 text-[15px] font-medium text-[#BCADA3] transition-colors hover:text-[#F2EDE8] ${FOCUS}`}>
        Sign in
      </a>
    </div>
  );
}
