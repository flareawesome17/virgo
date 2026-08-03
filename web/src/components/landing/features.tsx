'use client';

import {
  Bell,
  CalendarCheck,
  Images,
  Link2,
  MapPin,
  MessagesSquare,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { Reveal } from './reveal';

/**
 * What Virgo does.
 *
 * Every item here is something the product actually does today. A landing page
 * that lists a feature the app does not have costs more in the first support
 * conversation than it ever earned in signups.
 */
const FEATURES = [
  {
    icon: Images,
    title: 'Workspaces and albums',
    body: 'Photos, video and audio in one place, organised by workspace and album. Storage is counted honestly — what is actually in the bucket, not an estimate from the device.',
  },
  {
    icon: Link2,
    title: 'Client links that just open',
    body: 'Send a client a link and it works. No account, no app, no password — they see the album you shared and nothing else.',
  },
  {
    icon: Users,
    title: 'Collaborators, per album',
    body: 'Add someone to a workspace and they get every album in it, including ones made later. Remove them from a single album without touching the rest.',
  },
  {
    icon: MessagesSquare,
    title: 'Real-time chat',
    body: 'One-to-one and group threads that arrive instantly — read receipts, delivery ticks, replies, @mentions and a mute button that silences the noise but not the message.',
  },
  {
    icon: CalendarCheck,
    title: 'A calendar people answered',
    body: 'Invite collaborators to a shoot and they accept or decline. Accepting puts it on their calendar, so the schedule shows who is actually coming.',
  },
  {
    icon: Bell,
    title: 'Reminders that reach you',
    body: 'Alarms fire on the phone even with no signal, and the server pushes them too — so a call time still reaches you if the app was force-quit last week.',
  },
  {
    icon: MapPin,
    title: 'Find who you need nearby',
    body: 'Looking for a second shooter or an SDE photo editor within 30km? Filter by role and see who is around. Location is opt-in and reciprocal, and only distance is ever shared.',
  },
  {
    icon: ShieldCheck,
    title: 'Yours, and private',
    body: 'Nobody sees your work unless you share it. Location sharing is off until you turn it on, and turning it off erases the position rather than hiding it.',
  },
];

export function LandingFeatures() {
  return (
    <section id="features" className="relative py-24 sm:py-32">
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#c17745]">
            What you get
          </span>
          <h2 className="mt-3 text-balance text-3xl font-extrabold tracking-tight text-white sm:text-[2.6rem] sm:leading-[1.1]">
            The whole job, not just the photos
          </h2>
          <p className="mt-4 text-pretty text-[15px] leading-relaxed text-white/55">
            Shooting is the part you love. Virgo handles everything wrapped
            around it — the files, the client, the crew and the calendar.
          </p>
        </Reveal>

        <ul className="mt-14 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature, i) => (
            <Reveal
              as="li"
              key={feature.title}
              // Staggered by column so a row appears to arrive together.
              delay={(i % 4) * 70}
            >
              <span className="inline-flex size-11 items-center justify-center rounded-xl border border-[#c17745]/25 bg-[#c17745]/10">
                <feature.icon className="size-5 text-[#c17745]" />
              </span>
              <h3 className="mt-4 text-[15px] font-bold text-white">{feature.title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-white/50">
                {feature.body}
              </p>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
