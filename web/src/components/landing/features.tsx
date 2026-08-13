'use client';

import {
  Bell,
  CalendarCheck,
  Compass,
  Hourglass,
  Images,
  Network,
  Radio,
  Share2,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { Reveal } from './reveal';
import { Plate } from './plate';
import { SectionHeader } from './section-header';

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
    icon: Share2,
    title: 'Client links that just open',
    body: 'Send a client a link and it works. No account, no app, no password — they see the album you shared and nothing else.',
  },
  {
    icon: Hourglass,
    title: 'Deliverables that expire',
    body: 'Give an album a retention window and the files are deleted when it passes. Finished work stops costing you storage, and you never have to remember to clear it out.',
  },
  {
    icon: Users,
    title: 'Collaborators, per album',
    body: 'Add someone to a workspace and they get every album in it, including ones made later. Remove them from a single album without touching the rest.',
  },
  {
    icon: Radio,
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
    icon: Compass,
    title: 'Find who you need nearby',
    body: 'Looking for a second shooter or an SDE photo editor within 30km? Filter by role and see who is around. Location is opt-in and reciprocal, and only distance is ever shared.',
  },
  {
    icon: Network,
    title: 'A network you can actually search',
    body: 'Connect with the people you have worked with, by email or by name. Requests are accepted or declined — nobody lands in your network without agreeing to it.',
  },
  {
    icon: ShieldCheck,
    title: 'Yours, and private',
    body: 'Nobody sees your work unless you share it. Location sharing is off until you turn it on, and turning it off erases the position rather than hiding it.',
  },
];

export function LandingFeatures() {
  return (
    <section id="features" className="relative py-16 sm:py-20">
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <SectionHeader
          index="07"
          eyebrow="What you get"
          align="center"
          title="Everything around the shoot"
          lead="Shooting is the part you love. Virgo handles what is wrapped around it — the files, the client, the crew, the calendar, and the tidying up afterwards."
        />

        {/*
         * A bento, not ten identical cells.
         *
         * Two entries take a double column and a plate behind them, so the eye
         * has somewhere to land; the other eight stay bare. Ten equal tiles in
         * a 4-up grid is a specification sheet, and it read like one.
         *
         * The spans are chosen to fill exactly: 8 single + 2 double = 12
         * column units = three clean rows of four.
         */}
        <ul className="mt-10 grid gap-x-5 gap-y-7 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature, i) => {
            const wide = i === 0 || i === 5;
            return (
              <Reveal
                as="li"
                key={feature.title}
                // Staggered by column so a row appears to arrive together.
                delay={(i % 4) * 70}
                className={wide ? 'lg:col-span-2' : undefined}
              >
                <div
                  className={
                    wide
                      ? 'group relative h-full overflow-hidden rounded-2xl border border-white/10 p-5 transition-colors hover:border-[#c17745]/35'
                      : 'group h-full'
                  }
                >
                  {wide && (
                    <Plate
                      seed={i + 1}
                      aria-hidden
                      className="pointer-events-none absolute inset-0 -z-10 opacity-[0.22] transition-opacity duration-500 group-hover:opacity-30"
                    />
                  )}
                  <span className="inline-flex size-9 items-center justify-center rounded-lg border border-[#c17745]/25 bg-[#c17745]/10 transition-colors group-hover:border-[#c17745]/50 group-hover:bg-[#c17745]/15">
                    <feature.icon className="size-4 text-[#c17745]" />
                  </span>
                  <h3
                    className={
                      wide
                        ? 'mt-3 text-[15px] font-bold text-white'
                        : 'mt-3 text-[14px] font-bold text-white'
                    }
                  >
                    {feature.title}
                  </h3>
                  <p className="mt-1.5 text-[12.5px] leading-snug text-white/50">
                    {feature.body}
                  </p>
                </div>
              </Reveal>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
