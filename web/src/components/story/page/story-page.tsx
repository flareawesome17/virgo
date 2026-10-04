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
import { Faq } from './chapters/faq';
import { Finale } from './chapters/finale';
import { StoryFooter } from './chapters/footer';
import { Prologue } from './chapters/prologue';
import { TheWork } from './chapters/the-work';
import { mapLevels } from './map-levels';
import { MotionRoot } from './motion';
import { PrePaint } from './pre-paint';
import { SkyProvider } from './sky-stage';
import { StoryHeader } from './story-header';
import './story.css';

/**
 * virgo.ph: "Every shoot is a constellation" (docs/redesign/02-storyboard.md).
 *
 * Server-rendered and complete: every chapter's copy, figures and links are in
 * the HTML in their final state, which is also the reduced-motion, no-JS and
 * crawler page. Chapter islands then move what is already there when the
 * motion gate allows (build plan §1).
 */
export function StoryPage({ plans }: { plans: PlanInfo[] }) {
  return (
    <div className="story-page relative isolate min-h-svh bg-[#161311] text-[#F2EDE8] [overflow-x:clip]">
      <PrePaint />
      <MotionRoot>
        <SkyProvider levels={mapLevels()}>
          <StoryHeader />
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
        </SkyProvider>
      </MotionRoot>
      <div aria-hidden className="story-grain" style={{ backgroundImage: `url(${MEDIA.grain.url})` }} />
    </div>
  );
}
