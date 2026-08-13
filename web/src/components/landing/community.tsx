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
    // The tall one. Something on the page has to be allowed to breathe, and
    // this is the section carrying the argument the product rests on.
    <section id="community" className="relative overflow-hidden py-28 sm:py-40">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(40rem_26rem_at_78%_40%,color-mix(in_oklab,var(--primary)_15%,transparent),transparent_70%)]"
      />

      <div className="relative mx-auto w-full max-w-6xl px-5 sm:px-8">
        {/* The one section that keeps a centred header, and the only one at
            `lg` — five sections opening centred is a template, one is an
            emphasis. */}
        <SectionHeader
          index="05"
          eyebrow="The community"
          align="center"
          size="lg"
          title="A creative industry is a people business"
          lead="Most of the work in this trade comes from someone you know. Virgo makes that network something you can actually search, message and book — instead of a phone full of numbers you half remember."
        />

        <div className="mt-14 grid items-center gap-14 lg:grid-cols-2 lg:gap-20">
          <Reveal from="left">
            <ul className="flex flex-col gap-9">
              {THREADS.map((thread) => (
                <li key={thread.title} className="flex gap-4">
                  <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-[#c17745]/25 bg-[#c17745]/10">
                    <thread.icon className="size-4 text-[#c17745]" />
                  </span>
                  <span>
                    <span className="block text-[15px] font-bold text-white">
                      {thread.title}
                    </span>
                    <span className="mt-1.5 block text-[13px] leading-relaxed text-white/50">
                      {thread.body}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal from="right" delay={120} duration={900}>
            <div className="rounded-2xl border border-white/10 bg-[#1e1b18]/80 p-6 shadow-2xl shadow-black/40 backdrop-blur-xl">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/35">
                Every role on a shoot
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-white/50">
                You pick yours when you join — more than one, if you hold more
                than one. It is how people find you.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {ROLES.map((role, i) => (
                  <span
                    key={role}
                    className={
                      i % 4 === 1
                        ? 'rounded-full bg-[#c17745] px-3 py-1.5 text-[11px] font-bold text-white'
                        : 'rounded-full border border-white/10 px-3 py-1.5 text-[11px] font-semibold text-white/50'
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
