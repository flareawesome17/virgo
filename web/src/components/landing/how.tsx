'use client';

import { Reveal } from './reveal';

const STEPS = [
  {
    n: '01',
    title: 'Make a workspace',
    body: 'One per studio, or one per client — however you already think about your work. Albums live inside it.',
  },
  {
    n: '02',
    title: 'Bring your people in',
    body: 'Add the second shooter, the editor, the coordinator. They see the albums you shared, chat in the same threads, and answer the same calendar.',
  },
  {
    n: '03',
    title: 'Shoot, upload, schedule',
    body: 'Files go straight from the device to storage. Put the shoot on the calendar and invite whoever is on it.',
  },
  {
    n: '04',
    title: 'Send the client a link',
    body: 'They open it in a browser. No account, no download, nothing to explain on the phone afterwards.',
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
    <section id="how" className="relative py-24 sm:py-32">
      <div className="rule-fade mx-auto mb-24 w-full max-w-6xl" />

      <div className="mx-auto grid w-full max-w-6xl gap-14 px-5 sm:px-8 lg:grid-cols-[22rem_1fr] lg:gap-20">
        <Reveal from="left" className="lg:sticky lg:top-28 lg:self-start">
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#c17745]">
            How it works
          </span>
          <h2 className="mt-3 text-balance text-3xl font-extrabold tracking-tight text-white sm:text-[2.6rem] sm:leading-[1.1]">
            Set up once, in an afternoon
          </h2>
          <p className="mt-4 text-pretty text-[15px] leading-relaxed text-white/55">
            There is no migration and no onboarding call. Make a workspace, add
            your people, and the next shoot runs through it.
          </p>
        </Reveal>

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
