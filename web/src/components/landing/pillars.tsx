'use client';

import { Reveal } from './reveal';

/**
 * The three things Virgo is for.
 *
 * Deliberately three, not eight. The feature grid further down lists
 * everything; this says what the product is *for* — hire, deliver, forget.
 * Every claim maps to something that ships: Nearby with role filters, album
 * share links on client.virgo.ph, and albums.retention_days, which a daily
 * sweep now enforces against the bucket.
 */
const PILLARS = [
  {
    kicker: 'Hire',
    title: 'Need a second shooter by Saturday?',
    body: 'Filter by role and distance and see who is actually around — a photographer, an SDE photo editor, an HMUA. Send a request, get talking, book the job. No group chats, no asking around, no waiting for someone to reply to a story.',
  },
  {
    kicker: 'Deliver',
    title: 'One link. No account for the client.',
    body: 'Share an album and it opens in a browser. Nothing to install, nothing to sign up for, no password to explain over the phone. Choose whether they see photos, video, audio, or all three.',
  },
  {
    kicker: 'Forget',
    title: 'Delivered work deletes itself',
    body: 'Set a retention window when you make the album — 30 days, 90, whatever the contract says — and Virgo removes the files when it is up. You stop paying to store a job you finished last quarter, and you never have to remember to tidy it.',
  },
];

/** Staggered baselines. Three columns landing on one line is a table. */
const OFFSET = ['md:mt-0', 'md:mt-14', 'md:mt-7'];

export function LandingPillars() {
  return (
    <section id="pillars" className="relative py-20 sm:py-24">
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <ul className="grid gap-x-10 gap-y-14 md:grid-cols-3">
          {PILLARS.map((pillar, i) => (
            <Reveal as="li" key={pillar.kicker} delay={i * 110} className={OFFSET[i]}>
              {/* The icon-in-a-rounded-square chip appeared sixteen times on
                  this page in three sizes. Here it is a figure and a rule
                  instead — the number carries the sequence, which an icon
                  never did. */}
              <div className="group">
                <span className="figure flex items-baseline gap-3 text-[#c17745]">
                  <span className="text-[2rem] font-bold leading-none tabular-nums">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="text-[11px] font-semibold uppercase">
                    {pillar.kicker}
                  </span>
                </span>

                <span
                  aria-hidden
                  className="mt-4 block h-px w-full origin-left bg-white/10 transition-transform duration-500 group-hover:scale-x-100 md:scale-x-[0.35] md:group-hover:scale-x-100"
                />

                <h3 className="mt-5 text-balance text-xl font-bold leading-snug text-white">
                  {pillar.title}
                </h3>
                <p className="mt-3 text-[14px] leading-relaxed text-white/50">
                  {pillar.body}
                </p>
              </div>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
