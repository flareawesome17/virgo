'use client';

import { Handshake, Send, Timer } from 'lucide-react';
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
    icon: Handshake,
    kicker: 'Hire',
    title: 'Need a second shooter by Saturday?',
    body: 'Filter by role and distance and see who is actually around — a photographer, an SDE photo editor, an HMUA. Send a request, get talking, book the job. No group chats, no asking around, no waiting for someone to reply to a story.',
  },
  {
    icon: Send,
    kicker: 'Deliver',
    title: 'One link. No account for the client.',
    body: 'Share an album and it opens in a browser. Nothing to install, nothing to sign up for, no password to explain over the phone. Choose whether they see photos, video, audio, or all three.',
  },
  {
    icon: Timer,
    kicker: 'Forget',
    title: 'Delivered work deletes itself',
    body: 'Set a retention window when you make the album — 30 days, 90, whatever the contract says — and Virgo removes the files when it is up. You stop paying to store a job you finished last quarter, and you never have to remember to tidy it.',
  },
];

export function LandingPillars() {
  return (
    <section className="relative py-24 sm:py-28">
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <ul className="grid gap-x-8 gap-y-12 md:grid-cols-3">
          {PILLARS.map((pillar, i) => (
            <Reveal as="li" key={pillar.kicker} delay={i * 90}>
              <span className="inline-flex size-12 items-center justify-center rounded-2xl border border-[#c17745]/25 bg-[#c17745]/10">
                <pillar.icon className="size-5 text-[#c17745]" />
              </span>
              <span className="mt-5 block text-[11px] font-bold uppercase tracking-[0.18em] text-[#c17745]">
                {pillar.kicker}
              </span>
              <h3 className="mt-2 text-balance text-xl font-bold leading-snug text-white">
                {pillar.title}
              </h3>
              <p className="mt-3 text-[14px] leading-relaxed text-white/50">
                {pillar.body}
              </p>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
