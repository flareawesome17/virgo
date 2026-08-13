'use client';

import { MessageSquare, UserPlus, Users2 } from 'lucide-react';
import { Reveal } from './reveal';
import { SectionHeader } from './section-header';
import { ROLES } from './roles';

/**
 * The community half of the product.
 *
 * Everything claimed here ships: friend requests with accept/decline, real
 * one-to-one and group chat over a websocket, workspace collaborators with
 * per-album access, and event invitations that land on a calendar.
 *
 * **This is the page's one light section, and the inversion is the point.**
 * Eleven sections on one flat #161311 gave the page no chapters — you could
 * scroll it end to end without ever being told you had moved. Flipping the
 * middle one to the warm off-white the app already uses for light mode
 * (#fff8f4) is the cheapest possible way to say "different chapter", and it
 * introduces no new colour: every value below already ships in `globals.css`.
 *
 * It also lands on the right section. This is the argument the product rests
 * on — that the work comes from people you know — and it is the half a reader
 * is most likely to skim past in a wall of dark.
 */
const THREADS = [
  {
    icon: UserPlus,
    title: 'Connect with people you have worked with',
    body: 'Send a request, they accept, and you can message and collaborate. Nobody appears in your network without agreeing to it.',
  },
  {
    icon: MessageSquare,
    title: 'Talk in real time',
    body: 'One-to-one and group threads that arrive instantly — read receipts, replies, @mentions, and a mute that silences the noise without hiding the message.',
  },
  {
    icon: Users2,
    title: 'Work the job together',
    body: 'Add collaborators to a workspace and they get its albums. Invite them to a shoot and they accept or decline, so the calendar shows who is actually coming.',
  },
];

export function LandingCommunity() {
  return (
    // The tall one, and the light one. Something on the page has to be allowed
    // to breathe, and this is the section carrying the argument the product
    // rests on.
    <section
      id="community"
      className="relative overflow-hidden bg-[#fff8f4] py-28 text-[#1e1b18] sm:py-40"
    >
      {/* The same warm bloom as the dark sections at a third of the alpha —
          on off-white it reads as paper stock rather than as a light source. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(40rem_26rem_at_78%_40%,color-mix(in_oklab,#b66a40_9%,transparent),transparent_70%)]"
      />

      <div className="relative mx-auto w-full max-w-6xl px-5 sm:px-8">
        <SectionHeader
          index="05"
          eyebrow="The community"
          align="center"
          size="lg"
          tone="light"
          title="A creative industry is a people business"
          lead="Most of the work in this trade comes from someone you know. Virgo makes that network something you can actually search, message and book — instead of a phone full of numbers you half remember."
        />

        <div className="mt-14 grid items-center gap-14 lg:grid-cols-2 lg:gap-20">
          <Reveal from="left">
            <ul className="flex flex-col gap-9">
              {THREADS.map((thread) => (
                <li key={thread.title} className="flex gap-4">
                  <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-[#b66a40]/25 bg-[#b66a40]/10">
                    <thread.icon className="size-4 text-[#b66a40]" />
                  </span>
                  <span>
                    <span className="block text-[15px] font-bold text-[#1e1b18]">
                      {thread.title}
                    </span>
                    <span className="mt-1.5 block text-[13px] leading-relaxed text-[#54433c]">
                      {thread.body}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal from="right" delay={120} duration={900}>
            {/* White on off-white, not a dark card on light: a surface that
                only half inverts is how an inverted section starts looking
                like a mistake. */}
            <div className="rounded-2xl border border-[#d9c2b7] bg-white p-6 shadow-[0_24px_48px_-24px_rgba(30,27,24,0.25)]">
              <p className="figure text-[11px] font-semibold uppercase text-[#847167]">
                Every role on a shoot
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-[#54433c]">
                You pick yours when you join — more than one, if you hold more
                than one. It is how people find you.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {ROLES.map((role, i) => (
                  <span
                    key={role}
                    className={
                      i % 4 === 1
                        ? 'rounded-full bg-[#b66a40] px-3 py-1.5 text-[11px] font-bold text-white'
                        : 'rounded-full border border-[#d9c2b7] px-3 py-1.5 text-[11px] font-semibold text-[#54433c]'
                    }
                  >
                    {role}
                  </span>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
