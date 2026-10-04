import type { ReactNode } from 'react';
import { CH3, CH3_FIGCAPTION, CH3_KICKERS, CH3_SKY_CAPTION } from '@/components/story/data/strings/page-ch3';
import { DIRECT, NOTICES_CH3, THREAD } from '@/components/story/data/strings/ch3';
import { PHONE_RADIUS, PhoneFrame, Slab } from '@/components/story/frames';
import { ApplicantsCard } from '@/components/story/mocks/applicant-row';
import { BookingBadge } from '@/components/story/mocks/booking-badge';
import { ChatScreen, GroupThread } from '@/components/story/mocks/group-thread';
import { HiredTermsCard } from '@/components/story/mocks/hired-terms-card';
import { NotificationList, NotificationRow } from '@/components/story/mocks/notification-row';
import { ConstellationChart } from '@/components/story/svg';
import { Ch3Island } from '../islands/ch3';

/**
 * Ch3 — Connect (storyboard Ch3). Server-rendered in its final state: the
 * copy, the 2×2 set (applicants accepted, the terms confirmed with the
 * booking Agreed, the crew's thread, Virgo with Syrma hollow) and the
 * "Every role is filled" notice. With motion on, the set gives way to one
 * phone whose screens play the beats while the sky draws the threads and
 * the turn to Virgo (islands/ch3.tsx).
 */

const CARD = 'rounded-[20px] border border-[#2A2522] bg-[rgba(22,19,17,0.92)] p-5 sm:p-7';
const KICKER = 'font-mono text-[11px] uppercase tracking-[0.14em] text-[#D18A5A]';
const H3 = 'text-[clamp(1.25rem,1.1rem+0.8vw,1.625rem)] font-semibold leading-[1.2] tracking-[-0.015em] text-[#F2EDE8]';
const BODY = 'text-base leading-[1.6] text-[#BCADA3] lg:text-[17px]';
const SCREEN = 'absolute inset-0 bg-[#161311]';

/** One frame of the static set: a card slab at its rest pose, with a kicker. */
function SetCard({ kicker, turn, children }: { kicker: string; turn: number; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p aria-hidden className={`${KICKER} mb-3`}>
        {kicker}
      </p>
      <Slab className="w-full" rotateX={5} rotateY={turn} depth={8} radius="rounded-[20px]" edge="card">
        <div className="rounded-[20px] border border-[#2A2522] bg-[#161311] p-3 sm:p-4">{children}</div>
      </Slab>
    </div>
  );
}

export function Ch3() {
  return (
    <section id="connect" data-tone="night" data-chapter="connect" className="relative z-10 [overflow-x:clip]">
      <Ch3Island>
        <div
          data-part="ch3-track"
          className="relative mx-auto grid max-w-7xl gap-x-12 px-4 pb-16 pt-28 sm:px-8 [html[data-motion='on']_&]:pt-[22svh] lg:[html[data-motion='on']_&]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
        >
          {/* ── Copy, in normal flow over the sky. ── */}
          <div className={`${CARD} relative z-10 max-w-[36rem] lg:col-start-1`}>
            <p className={KICKER}>
              {CH3.eyebrowNo} · <time dateTime={CH3.eyebrowTimeIso}>{CH3.eyebrowTime}</time>
            </p>
            <h2 className="mt-4 max-w-[18ch] text-[clamp(2rem,1.3rem+3.4vw,4.25rem)] font-semibold leading-none tracking-[-0.03em] text-[#F2EDE8]">
              {CH3.h2}
            </h2>
            <p className="mt-5 max-w-[42ch] text-[1.0625rem] leading-[1.55] text-[#F2EDE8] lg:text-[1.25rem]">{CH3.lead}</p>
            <p className={`mt-4 max-w-[52ch] ${BODY}`}>{CH3.body}</p>
          </div>

          {/* ── Motion: one phone plays the beats (desktop: sticky on the right; phones: in flow). ── */}
          <div className="motion-only relative mt-16 min-w-0 lg:col-start-2 lg:row-span-4 lg:row-start-1 lg:mt-0">
            <figure className="lg:sticky lg:top-0 lg:flex lg:h-svh lg:items-center lg:justify-center">
              <div data-part="ch3-stage" className="mx-auto w-[min(100%,360px)] will-change-transform lg:w-[min(100%,380px,39svh)]">
                <Slab className="w-full" rotateX={4} rotateY={-8} depth={14} radius={PHONE_RADIUS} edge="device" shadow="floor">
                  <PhoneFrame width="100%" time="12:58">
                    <div aria-hidden className="absolute inset-0">
                      <div data-part="ch3-s-new" className={`${SCREEN} px-4 pt-3`}>
                        <ApplicantsCard platform="phone" state="new" />
                      </div>
                      <div data-part="ch3-s-apply" className={`${SCREEN} px-4 pt-3`}>
                        <ApplicantsCard platform="phone" state="agreed" />
                      </div>
                      <div data-part="ch3-s-terms-new" className={SCREEN}>
                        <ChatScreen title={DIRECT.title} placeholder={THREAD.placeholderDirect}>
                          <HiredTermsCard side="creative" state="needs-you" className="my-1.5" />
                        </ChatScreen>
                      </div>
                      <div data-part="ch3-s-terms" className={SCREEN}>
                        <ChatScreen title={DIRECT.title} placeholder={THREAD.placeholderDirect}>
                          <HiredTermsCard side="creative" state="confirmed" className="my-1.5" />
                        </ChatScreen>
                      </div>
                      <div data-part="ch3-s-thread" className={SCREEN}>
                        <GroupThread state="read" />
                      </div>
                      <div data-part="ch3-toast" className="absolute inset-x-3 top-2 z-10 opacity-0">
                        <NotificationList platform="phone">
                          <NotificationRow platform="phone" first {...NOTICES_CH3.appliedErnie} />
                        </NotificationList>
                      </div>
                    </div>
                  </PhoneFrame>
                </Slab>
              </div>
              <figcaption className="sr-only">{CH3_FIGCAPTION}</figcaption>
            </figure>
          </div>

          <div
            className={`${CARD} relative z-10 mt-16 max-w-[36rem] lg:col-start-1 [html[data-motion='on']_&]:mt-[40svh] lg:[html[data-motion='on']_&]:mt-[70svh]`}
          >
            <h3 className={H3}>{CH3.h3}</h3>
            <p className={`mt-4 max-w-[52ch] ${BODY}`}>{CH3.h3Body}</p>
          </div>

          {/* ── Motion: room for the sky, where Virgo forms. Nothing covers it. ── */}
          <figure className="motion-only relative flex h-[120svh] items-end lg:col-start-1 lg:col-end-3 lg:h-[115svh]">
            <div className="w-full pb-[8svh] text-center">
              <p aria-hidden className={`${KICKER} lg:hidden`}>
                {CH3.starLine}
              </p>
              <p aria-hidden className={`${KICKER} hidden lg:block`}>
                {CH3.starCaption}
              </p>
            </div>
            <figcaption className="sr-only">{CH3_SKY_CAPTION}</figcaption>
          </figure>
        </div>

        {/* ── Static (reduced motion, no JS): the 2×2 set, then Virgo. ── */}
        <div className="static-only relative z-10 mx-auto max-w-7xl px-4 sm:px-8">
          <figure>
            <div aria-hidden className="grid gap-x-8 gap-y-12 md:grid-cols-2">
              <SetCard kicker={CH3_KICKERS.applied} turn={-6}>
                <ApplicantsCard platform="phone" state="agreed" />
              </SetCard>
              <SetCard kicker={CH3_KICKERS.terms} turn={6}>
                <HiredTermsCard side="creative" state="confirmed" />
                <div className="mt-4">
                  <p className={`${KICKER} mb-2`}>{CH3_KICKERS.booking}</p>
                  <BookingBadge platform="phone" side="poster" state="agreed" />
                </div>
              </SetCard>
              <SetCard kicker={CH3_KICKERS.thread} turn={-6}>
                <div className="h-[300px] overflow-hidden rounded-[14px]">
                  <GroupThread state="read" />
                </div>
              </SetCard>
              <div className="min-w-0">
                <p className={`${KICKER} mb-3`}>{CH3_KICKERS.sky}</p>
                <div className="rounded-[20px] border border-[#2A2522] bg-[radial-gradient(90%_80%_at_50%_40%,#1f1a17_0%,#161311_70%)] px-6 py-8">
                  <ConstellationChart labels="cast" />
                </div>
              </div>
            </div>
            <figcaption className="mt-8 max-w-[70ch] text-sm leading-relaxed text-[#A08E84]">
              {CH3_FIGCAPTION} {CH3_SKY_CAPTION}
            </figcaption>
          </figure>
          <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.14em] text-[#BCADA3]">{CH3.starCaption}</p>
        </div>

        {/* ── Every role is filled: the notice Mika gets, in both modes. ── */}
        <div className="relative z-10 mx-auto max-w-7xl px-4 pb-24 pt-14 sm:px-8">
          <figure className="mx-auto max-w-[420px]">
            <Slab className="w-full" rotateX={6} rotateY={-5} depth={8} radius="rounded-[16px]" edge="card" shadow="floor">
              <div aria-hidden>
                <NotificationList platform="phone">
                  <NotificationRow platform="phone" first {...NOTICES_CH3.filled} />
                </NotificationList>
              </div>
            </Slab>
            <figcaption className="sr-only">
              {NOTICES_CH3.filled.title}. {NOTICES_CH3.filled.body}
            </figcaption>
          </figure>
          <p className="mx-auto mt-10 max-w-[60ch] text-center text-[13px] leading-relaxed text-[#A08E84]">{CH3.footnote}</p>
        </div>
      </Ch3Island>
    </section>
  );
}
