import type { ReactNode } from 'react';
import { FILLED } from '../../data/strings/ch1';
import { BIG_CLOCK, BIG_CLOCK_FULL, CH1, FIGURE } from '../../data/strings/page-ch1';
import { WHEN } from '../../data/story';
import { LOCK_WALLPAPER, PHONE_RADIUS, PhoneFrame, Slab, lockTime } from '../../frames';
import { CHAT_PILE, ChatCardStack, chatDeck, chatStackClock, type ChatDeck, type ChatStackCount } from '../../mocks/chat-card-stack';
import { JobPostForm } from '../../mocks/job-post-form';
import { StarStop } from '../../svg';
import { Ch1Stage, type Ch1Config } from '../islands/ch1';

/**
 * Ch1 — Wednesday, 11:42 PM · #hire (alias #how). Storyboard Ch1.
 *
 * Static page: "11:42 PM" in display mono, then two still 3D figures — the
 * frozen pile at 11:57, and the finished form stamped "Posted · 11:58 PM".
 *
 * Motion: a sticky phone (right column on desktop, the top 54 svh on phones)
 * with the pile and the form layered in one screen; the island plays the
 * pile, the freeze and the fill from scroll while the step cards pass.
 */

/** "SDE Editor Video" → "sde-editor-video", as the form names its parts. */
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const clocks = (deck: ChatDeck) =>
  Array.from({ length: chatDeck(deck).length + 1 }, (_, n) => chatStackClock(n as ChatStackCount, deck));

const CONFIG: Ch1Config = {
  pile: {
    peek: CHAT_PILE.peek,
    depth: CHAT_PILE.depth,
    twist: [...CHAT_PILE.twist],
    nudge: [...CHAT_PILE.nudge],
    fog: CHAT_PILE.fog,
    fogMax: CHAT_PILE.fogMax,
  },
  clocks: { '5': clocks(5), '7': clocks(7) },
  roles: FILLED.budgets.map((b) => slug(b.role)),
};

/** Phones: the pile anchors to the foot of a short screen and the clock is smaller, so the newest card is never cut off. */
const SHORT_LOCK =
  '[&_[data-part=lock-notifications]]:absolute [&_[data-part=lock-notifications]]:inset-x-3 [&_[data-part=lock-notifications]]:bottom-0 [&_[data-part=lock-notifications]]:pb-5 [&_[data-part=lock-time]]:text-[64px] [&_[data-part=lock-screen]]:pt-3';

/** One phone that plays the whole chapter: the pile and the form in one screen. Starts at p = 0. */
function PhoneRig({ deck }: { deck: ChatDeck }) {
  const phone = deck === 5;
  return (
    <div
      data-rig=""
      data-deck={deck}
      className={phone ? `relative h-full w-full ${SHORT_LOCK}` : 'relative flex h-full w-full items-center justify-center'}
    >
      {!phone && (
        <span
          aria-hidden
          data-part="big-clock"
          className="figure pointer-events-none absolute left-1/2 top-1/2 -z-10 -translate-x-1/2 -translate-y-1/2 select-none text-[clamp(3.5rem,19vw,14rem)] font-semibold leading-[0.86] tracking-[-0.05em] text-[#F2EDE8]"
          style={{ opacity: 0 }}
        >
          {BIG_CLOCK}
        </span>
      )}
      <Slab
        rotateX={phone ? 5 : 7}
        rotateY={phone ? -7 : -14}
        depth={14}
        radius={PHONE_RADIUS}
        edge="device"
        shadow={phone ? false : 'floor'}
        className={phone ? 'w-full' : 'w-[min(360px,calc((100svh-128px)*0.4615))]'}
      >
        <PhoneFrame width="100%" time={chatStackClock(0, deck)} screen={LOCK_WALLPAPER} ratio={phone ? 0 : 9 / 19.5}>
          <div className={phone ? 'relative h-[calc(54svh-46px)]' : 'absolute inset-0'}>
            <ChatCardStack state={0} cards={deck} />
            <div data-part="form-layer" className="absolute inset-0 z-50" style={{ transform: 'translate3d(0, 102%, 0)', opacity: 0 }}>
              <JobPostForm state="empty" />
            </div>
          </div>
        </PhoneFrame>
      </Slab>
      {/* The post, rising as a small star (hand-off to the sky). */}
      <span
        aria-hidden
        data-part="post-star"
        className={`pointer-events-none absolute left-1/2 z-50 -ml-3 leading-none ${phone ? 'bottom-[18%] text-[56px]' : 'bottom-[22%] text-[80px]'}`}
        style={{ opacity: 0 }}
      >
        <StarStop />
      </span>
    </div>
  );
}

/** A still phone for the static page, at its 3D rest pose. */
function StillPhone({ label, turn, time, screen, children }: { label: string; turn: number; time: string; screen?: string; children: ReactNode }) {
  return (
    <div className="flex w-full flex-col items-center">
      <p className="figure mb-6 text-xs uppercase tracking-[0.14em] text-[#D18A5A]">{label}</p>
      <Slab rotateX={4} rotateY={turn} depth={14} radius={PHONE_RADIUS} edge="device" shadow="floor" className="w-[min(100%,360px)]">
        <PhoneFrame width="100%" time={time} screen={screen}>
          {children}
        </PhoneFrame>
      </Slab>
    </div>
  );
}

/** Phones, in motion: a card rises to just under the phone and holds there, so it never covers the screen it narrates. */
const PIN = "max-lg:[html[data-motion='on']_&]:sticky max-lg:[html[data-motion='on']_&]:top-[calc(54svh+72px)]";

const CARD = 'max-lg:rounded-2xl max-lg:bg-[#1E1B18]/96 max-lg:px-5 max-lg:py-5 max-lg:shadow-[0_20px_50px_-24px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.04)]';

export function Ch1() {
  return (
    <section id="hire" data-tone="night" data-chapter="hire" className="relative z-10 pb-24 lg:pb-32">
      <span id="how" aria-hidden className="absolute top-0" />
      <Ch1Stage
        config={CONFIG}
        className={`relative mx-auto max-w-6xl px-5 sm:px-8 lg:[html[data-motion='on']_&]:grid lg:[html[data-motion='on']_&]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:[html[data-motion='on']_&]:gap-x-12`}
      >
        {/* Intro: the problem, named. */}
        <div data-part="ch1-intro" className={`pt-28 pb-10 lg:pt-32 lg:[html[data-motion='on']_&]:col-start-1 lg:[html[data-motion='on']_&]:row-start-1 lg:[html[data-motion='on']_&]:flex lg:[html[data-motion='on']_&]:min-h-[72svh] lg:[html[data-motion='on']_&]:flex-col lg:[html[data-motion='on']_&]:justify-center`}>
          <p className="figure text-xs uppercase tracking-[0.14em] text-[#D18A5A]">{CH1.eyebrow}</p>
          <h2 className="mt-4 max-w-[18ch] text-[clamp(2rem,1.3rem+3.4vw,4.25rem)] font-semibold leading-none tracking-[-0.03em] text-[#F2EDE8]">
            {CH1.title}
          </h2>
          <p className="mt-6 max-w-[34ch] text-[1.0625rem] leading-[1.6] text-[#BCADA3] sm:max-w-[48ch] lg:text-lg">{CH1.body}</p>
        </div>

        {/* The phone: sticky, one screen that plays the whole chapter (motion only). */}
        <figure
          className={`motion-only pointer-events-none sticky top-14 z-0 -mx-5 h-[54svh] sm:-mx-8 lg:top-0 lg:mx-0 lg:h-svh lg:self-start lg:pt-16 lg:[html[data-motion='on']_&]:col-start-2 lg:[html[data-motion='on']_&]:row-start-1 lg:[html[data-motion='on']_&]:row-end-4`}
        >
          <div aria-hidden className="h-full px-2 lg:hidden">
            <PhoneRig deck={5} />
          </div>
          <div aria-hidden className="hidden h-full lg:block">
            <PhoneRig deck={7} />
          </div>
          <figcaption className="sr-only">{FIGURE.caption}</figcaption>
        </figure>

        {/* Step 1: the three time lines. */}
        <div className={`relative z-10 lg:[html[data-motion='on']_&]:col-start-1 lg:[html[data-motion='on']_&]:row-start-2`}>
          <ol className={`flex flex-col gap-4 [html[data-motion='on']_&]:gap-[24svh] lg:[html[data-motion='on']_&]:gap-[16svh] [html[data-motion='on']_&]:pt-[6svh] lg:[html[data-motion='on']_&]:pt-[4svh] max-lg:[html[data-motion='on']_&]:after:block max-lg:[html[data-motion='on']_&]:after:h-0 max-lg:[html[data-motion='on']_&]:after:content-['']`}>
            {CH1.steps.map((s, i) => (
              <li key={s.iso} data-part={`ch1-step-${i + 1}`} data-sticky="" className={`relative pl-5 ${CARD} ${PIN}`}>
                <span
                  aria-hidden
                  data-part={`step-mark-${i + 1}`}
                  className="absolute bottom-1 left-0 top-1 w-[3px] origin-top rounded-full bg-[#D18A5A] max-lg:bottom-5 max-lg:left-3 max-lg:top-5"
                />
                <p className="text-xl leading-snug text-[#F2EDE8] max-lg:pl-1 lg:text-2xl">
                  <strong className="font-semibold">
                    <time dateTime={s.iso} className="figure text-[#D18A5A]">
                      {s.time}.
                    </time>
                  </strong>{' '}
                  {s.text}
                </p>
              </li>
            ))}
          </ol>
          <p
            data-part="ch1-pull"
            className={`mt-12 max-w-[30ch] text-[1.375rem] font-medium leading-[1.35] tracking-[-0.01em] text-[#F2EDE8] lg:text-[1.75rem] [html[data-motion='on']_&]:mt-[20svh] lg:[html[data-motion='on']_&]:mt-[18svh] ${CARD}`}
          >
            <span aria-hidden className="mb-3 block h-px w-10 bg-[#D18A5A]" />
            {CH1.pull}
          </p>
        </div>

        {/* Step 2: the way out. */}
        <div data-part="ch1-turn" className={`relative z-10 mt-14 [html[data-motion='on']_&]:mt-[56svh] lg:[html[data-motion='on']_&]:col-start-1 lg:[html[data-motion='on']_&]:row-start-3 lg:[html[data-motion='on']_&]:mt-[20svh] [html[data-motion='on']_&]:after:block [html[data-motion='on']_&]:after:h-[58svh] lg:[html[data-motion='on']_&]:after:h-[82svh] [html[data-motion='on']_&]:after:content-['']`}>
          <div data-sticky="" className={`${CARD} ${PIN} lg:[html[data-motion='on']_&]:sticky lg:[html[data-motion='on']_&]:top-[40svh]`}>
            <h3 className="text-[clamp(1.25rem,1.1rem+0.8vw,1.625rem)] font-semibold leading-[1.2] text-[#F2EDE8]">{CH1.turn}</h3>
            <p className="mt-3 max-w-[34ch] text-[1.0625rem] leading-[1.6] text-[#BCADA3] sm:max-w-[44ch]">{CH1.turnBody}</p>
          </div>
        </div>
      </Ch1Stage>

      {/* The static page: before and after, still and in depth. */}
      <figure className="static-only mx-auto mt-16 max-w-6xl px-5 sm:px-8">
        <p aria-hidden className="figure text-[clamp(3.5rem,14vw,9rem)] font-semibold leading-[0.86] tracking-[-0.05em] text-[#F2EDE8]/20">
          {BIG_CLOCK_FULL}
        </p>
        <div aria-hidden className="mt-12 grid justify-items-center gap-16 md:grid-cols-2 md:gap-10">
          <StillPhone label={FIGURE.before} turn={-8} time={chatStackClock('frozen', 5)} screen={LOCK_WALLPAPER}>
            <ChatCardStack state="frozen" cards={5} />
          </StillPhone>
          <StillPhone label={FIGURE.after} turn={8} time={lockTime(WHEN.posted)}>
            <JobPostForm state="posted" />
          </StillPhone>
        </div>
        <figcaption className="mx-auto mt-12 max-w-[60ch] text-center text-[15px] leading-relaxed text-[#BCADA3]">{FIGURE.caption}</figcaption>
      </figure>

      <p className="mx-auto mt-10 max-w-6xl px-5 text-xs leading-relaxed text-[#A08E84] sm:px-8">{CH1.footnote}</p>
    </section>
  );
}
