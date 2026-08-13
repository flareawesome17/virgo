'use client';

import { Reveal } from './reveal';
import { SectionHeader } from './section-header';

const STEPS = [
  {
    n: '01',
    title: 'Say what you do',
    body: 'Pick your roles when you join — photographer, video editor, HMUA, more than one if you hold more than one. It is how other creatives find you.',
  },
  {
    n: '02',
    title: 'Find your people',
    body: 'Search Nearby by role and distance for a second shooter or an SDE editor. Connect with the ones you already work with, and message them here.',
  },
  {
    n: '03',
    title: 'Run the shoot together',
    body: 'Put it on the calendar and invite the crew — they accept or decline. Files go from the device straight into the album.',
  },
  {
    n: '04',
    title: 'Deliver, then let it expire',
    body: 'Send the client a link they can just open. Set the retention window and the files clear themselves out once the job is long done.',
  },
];

/**
 * How it works.
 *
 * A numbered rail rather than four cards: the steps are sequential, and cards
 * in a grid read as options you pick between.
 */
export function LandingHow() {
  return (
    <section id="how" className="relative py-20 sm:py-24">
      <div className="mx-auto grid w-full max-w-6xl gap-14 px-5 sm:px-8 lg:grid-cols-[22rem_1fr] lg:gap-20">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <SectionHeader
            index="08"
            eyebrow="How it works"
            size="sm"
            title="From finding a crew to closing the job"
            lead="No migration, no onboarding call. Make an account, say what you do, and the next booking can run through it end to end."
          />
        </div>

        <ol className="relative">
          {/* The rail the numbers sit on. */}
          <span
            aria-hidden
            className="absolute left-[1.4rem] top-2 bottom-2 w-px bg-gradient-to-b from-[#c17745]/40 via-white/10 to-transparent"
          />
          {STEPS.map((step, i) => (
            <Reveal as="li" key={step.n} delay={i * 90} className="relative flex gap-6 pb-12 last:pb-0">
              <span className="relative z-10 flex size-11 shrink-0 items-center justify-center rounded-full border border-[#c17745]/30 bg-[#1e1b18] text-[12px] font-bold text-[#c17745]">
                {step.n}
              </span>
              <span className="pt-1.5">
                <span className="block text-[17px] font-bold text-white">{step.title}</span>
                <span className="mt-2 block max-w-lg text-[14px] leading-relaxed text-white/50">
                  {step.body}
                </span>
              </span>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
