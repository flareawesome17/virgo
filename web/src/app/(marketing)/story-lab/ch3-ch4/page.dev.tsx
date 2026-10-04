import type { CSSProperties, ReactNode } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { WHEN } from '@/components/story/data/story';
import { APPLICANT, DIRECT, NOTICES_CH3, THREAD } from '@/components/story/data/strings/ch3';
import { NOTICES_CH4, RINGS } from '@/components/story/data/strings/ch4';
import { TODAY } from '@/components/story/data/strings/common';
import {
  BROWSER_RADIUS,
  BrowserFrame,
  LOCK_WALLPAPER,
  LockNotification,
  LockScreen,
  lockDate,
  lockTime,
  PHONE_RADIUS,
  PhoneFrame,
  Slab,
} from '@/components/story/frames';
import { ApplicantsCard, type ApplicantsBeat } from '@/components/story/mocks/applicant-row';
import { BookingBadge } from '@/components/story/mocks/booking-badge';
import { EmailSubjectChip } from '@/components/story/mocks/email-subject-chip';
import { EventDetail, type EventBeat } from '@/components/story/mocks/event-detail';
import { ChatScreen, GroupThread, type ThreadState } from '@/components/story/mocks/group-thread';
import { HiredTermsCard } from '@/components/story/mocks/hired-terms-card';
import { DayAgenda, MonthGrid } from '@/components/story/mocks/month-grid';
import { NotificationList, NotificationRow } from '@/components/story/mocks/notification-row';
import { ReminderSheet, type ReminderSheetState } from '@/components/story/mocks/reminder-sheet';

/**
 * Ch3 Connect and Ch4 The Calendar: applicants, terms, booking, crew thread, calendar, event, reminder, every state.
 */
export const metadata: Metadata = {
  title: 'Story lab · Ch3 & Ch4',
  robots: { index: false, follow: false },
};

/**
 * The lab's own motion, to prove the depth and the in-place flips run on the
 * compositor alone (transform and opacity, nothing else). Phase 4 drives the
 * same parts from scroll. Reduced motion keeps every rest pose.
 */
const LAB_CSS = `
@keyframes m2-turn { 0%,100% { transform: rotateX(4deg) rotateY(-10deg) } 50% { transform: rotateX(4deg) rotateY(10deg) } }
@keyframes m2-turn-d { 0%,100% { transform: rotateX(5deg) rotateY(-16deg) translateZ(0) } 50% { transform: rotateX(5deg) rotateY(16deg) translateZ(24px) } }
@keyframes m2-sheen-a { 0%,100% { opacity: 1 } 50% { opacity: 0 } }
@keyframes m2-sheen-b { 0%,100% { opacity: 0 } 50% { opacity: 1 } }
@keyframes m2-out { 0%,38% { opacity: 1; transform: none } 46%,92% { opacity: 0; transform: translateY(-5px) } 100% { opacity: 1; transform: none } }
@keyframes m2-in { 0%,38% { opacity: 0; transform: translateY(5px) } 46%,92% { opacity: 1; transform: none } 100% { opacity: 0; transform: translateY(5px) } }
@keyframes m2-roll { 0%,52% { transform: translateY(0) } 62%,92% { transform: translateY(-20px) } 100% { transform: translateY(0) } }
@keyframes m2-q1 { 0%,22% { opacity: 1 } 25%,97% { opacity: 0 } 100% { opacity: 1 } }
@keyframes m2-q3 { 0%,22% { opacity: 0 } 25%,97% { opacity: 1 } 100% { opacity: 0 } }
@keyframes m2-row-bea { 0%,12% { transform: translateY(0) } 18%,36% { transform: translateY(60px) } 42%,60% { transform: translateY(120px) } 66%,100% { transform: translateY(0) } }
@keyframes m2-row-ernie { 0%,12% { transform: translateY(0) } 18%,60% { transform: translateY(-60px) } 66%,100% { transform: translateY(0) } }
@keyframes m2-row-kenn { 0%,36% { transform: translateY(0) } 42%,60% { transform: translateY(-60px) } 66%,100% { transform: translateY(0) } }
@keyframes m2-yes-ernie { 0%,12% { opacity: 0 } 18%,90% { opacity: 1 } 96%,100% { opacity: 0 } }
@keyframes m2-yes-kenn { 0%,36% { opacity: 0 } 42%,90% { opacity: 1 } 96%,100% { opacity: 0 } }
@keyframes m2-yes-bea { 0%,60% { opacity: 0 } 66%,90% { opacity: 1 } 96%,100% { opacity: 0 } }
@keyframes m2-no-ernie { 0%,12% { opacity: 1 } 18%,90% { opacity: 0 } 96%,100% { opacity: 1 } }
@keyframes m2-no-kenn { 0%,36% { opacity: 1 } 42%,90% { opacity: 0 } 96%,100% { opacity: 1 } }
@keyframes m2-no-bea { 0%,60% { opacity: 1 } 66%,90% { opacity: 0 } 96%,100% { opacity: 1 } }
.m2-turn [data-part="slab-body"] { animation: m2-turn 11s cubic-bezier(.65,0,.35,1) infinite; animation-delay: var(--delay, 0s) }
.m2-turn [data-part="slab-sheen-a"] { animation: m2-sheen-a 11s cubic-bezier(.65,0,.35,1) infinite; animation-delay: var(--delay, 0s) }
.m2-turn [data-part="slab-sheen-b"] { animation: m2-sheen-b 11s cubic-bezier(.65,0,.35,1) infinite; animation-delay: var(--delay, 0s) }
.m2-flip [data-part^="booking-"] > [data-face="waiting"],
.m2-flip [data-part^="role-"] > [data-face="open"],
.m2-flip [data-part="selected-day"] > [data-face="off"] { animation: m2-out 7s cubic-bezier(.16,1,.3,1) infinite; animation-delay: var(--d, 0s) }
.m2-flip [data-part^="booking-"] > [data-face="agreed"],
.m2-flip [data-part^="role-"] > [data-face="filled"],
.m2-flip [data-part="selected-day"] > [data-face="on"] { animation: m2-in 7s cubic-bezier(.16,1,.3,1) infinite; animation-delay: var(--d, 0s) }
.m2-flip [data-part^="booking-"] > *, .m2-flip [data-part="role-sde-editor-video"] > * { --d: .35s }
.m2-flip [data-part="role-hmua"] > * { --d: .7s }
/* Who's coming: each yes flips the status and the list re-sorts the way the
   API sends it (going first, then by name), rows sliding to their slots. */
.m2-flip [data-part="attendee-bea"] { animation: m2-row-bea 8s cubic-bezier(.34,1.32,.64,1) infinite }
.m2-flip [data-part="attendee-ernie"] { animation: m2-row-ernie 8s cubic-bezier(.34,1.32,.64,1) infinite }
.m2-flip [data-part="attendee-kenn"] { animation: m2-row-kenn 8s cubic-bezier(.34,1.32,.64,1) infinite }
.m2-flip [data-part="status-bea"] > [data-face="accepted"] { animation: m2-yes-bea 8s linear infinite }
.m2-flip [data-part="status-ernie"] > [data-face="accepted"] { animation: m2-yes-ernie 8s linear infinite }
.m2-flip [data-part="status-kenn"] > [data-face="accepted"] { animation: m2-yes-kenn 8s linear infinite }
.m2-flip [data-part="status-bea"] > [data-face="pending"] { animation: m2-no-bea 8s linear infinite }
.m2-flip [data-part="status-ernie"] > [data-face="pending"] { animation: m2-no-ernie 8s linear infinite }
.m2-flip [data-part="status-kenn"] > [data-face="pending"] { animation: m2-no-kenn 8s linear infinite }
.m2-flip [data-part="call-roll"] { animation: m2-roll 7s cubic-bezier(.65,0,.35,1) infinite }
.m2-flip [data-part="bubble-ask-ticks"] > [data-face],
.m2-flip [data-part="bubble-ask-body"] > [data-face="plain"],
.m2-flip [data-part="bubble-ask-footer"] > [data-face="sending"],
.m2-flip [data-part="attendee-summary"] > [data-face] { animation: m2-q1 8s steps(1, end) infinite }
.m2-flip [data-part="bubble-ask-body"] > [data-face="marked"],
.m2-flip [data-part="bubble-ask-footer"] > [data-face="time"] { animation: m2-q3 8s steps(1, end) infinite }
.m2-flip [data-part="attendee-summary"] > [data-face="1"] { animation-delay: -6s }
.m2-flip [data-part="attendee-summary"] > [data-face="2"] { animation-delay: -4s }
.m2-flip [data-part="attendee-summary"] > [data-face="3"] { animation-delay: -2s }
.m2-flip [data-part="bubble-ask-ticks"] > [data-face="sent"] { animation-delay: -6s }
.m2-flip [data-part="bubble-ask-ticks"] > [data-face="delivered"] { animation-delay: -4s }
.m2-flip [data-part="bubble-ask-ticks"] > [data-face="read"] { animation-delay: -2s }
.m2-flip [data-part="bubble-ask-seen"] > [data-face="3"] { animation: m2-q1 8s steps(1, end) infinite; animation-delay: -2s }
@media (min-width: 768px) { .m2-turn [data-part="slab-body"] { animation-name: m2-turn-d } }
@media (prefers-reduced-motion: reduce) { .m2-turn *, .m2-flip * { animation: none !important } }
`;

// ─── Layout helpers (lab chrome only) ────────────────────────────────────

function Section({ n, title, note, children }: { n: string; title: string; note: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-24 first:mt-14">
      <p className="figure text-[11px] uppercase tracking-[0.14em] text-[#D18A5A]">{n}</p>
      <h2 className="mt-1.5 text-2xl font-semibold tracking-[-0.02em]">{title}</h2>
      <p className="mt-2 max-w-[72ch] text-[14px] leading-relaxed text-[#BCADA3]">{note}</p>
      <div className="mt-10">{children}</div>
    </section>
  );
}

function Specimen({ caption, children, className = '' }: { caption: string; children: ReactNode; className?: string }) {
  return (
    <figure className={`flex min-w-0 flex-col items-center ${className}`}>
      <div className="flex w-full justify-center">{children}</div>
      <figcaption className="figure mt-6 text-center text-[11px] leading-relaxed text-[#A08E84]">{caption}</figcaption>
    </figure>
  );
}

/** A phone at its 3D rest pose (§1.13): turned under 10°, so it holds at every width. */
function Phone({
  children,
  i = 0,
  time = '1:04',
  signal,
  ratio,
  screen,
  width = 'w-[min(100%,400px)]',
  className = '',
}: {
  children: ReactNode;
  i?: number;
  time?: string;
  signal?: 0 | 1 | 2 | 3 | 4;
  ratio?: number;
  screen?: string;
  width?: string;
  className?: string;
}) {
  return (
    <Slab
      className={`${width} ${className}`}
      rotateY={i % 2 ? 8 : -8}
      rotateX={4}
      depth={14}
      radius={PHONE_RADIUS}
      edge="device"
      shadow="floor"
    >
      <PhoneFrame width="100%" time={time} signal={signal} ratio={ratio} screen={screen}>
        {children}
      </PhoneFrame>
    </Slab>
  );
}

/** A browser window at its rest pose: tipped back a little, as if on a desk. */
function Browser({ url, children, i = 0, className = '' }: { url: string; children: ReactNode; i?: number; className?: string }) {
  return (
    <Slab
      className={`w-full ${className}`}
      rotateX={5}
      rotateY={i % 2 ? 4 : -4}
      depth={10}
      radius={BROWSER_RADIUS}
      edge="card"
    >
      <BrowserFrame url={url} viewportClassName="p-3 sm:p-5">
        {children}
      </BrowserFrame>
    </Slab>
  );
}

const PHONE_GRID = 'grid justify-items-center gap-x-5 gap-y-16 md:grid-cols-2 xl:grid-cols-3';

const APPLICANT_BEATS: { state: ApplicantsBeat; accepting?: 'ernie'; caption: string }[] = [
  { state: 'new', caption: 'new · three applications, 3 new' },
  { state: 'new', accepting: 'ernie', caption: 'new + accepting ernie · spinner, buttons off' },
  { state: 'ernie', caption: 'ernie · accepted, Videographer filled' },
  { state: 'kenn', caption: 'kenn · two accepted, 1 new' },
  { state: 'filled', caption: 'filled · all three, bookings waiting on them' },
  { state: 'agreed', caption: 'agreed (default) · Ernie confirmed' },
];

const THREAD_STATES: ThreadState[] = ['sending', 'sent', 'delivered', 'replied', 'read'];
const EVENT_BEATS: EventBeat[] = ['invited', 'going-1', 'going-2', 'going', 'moved', 'reminded'];
const REMINDER_STATES: ReminderSheetState[] = ['empty', 'titled', 'filled'];

export default function Ch3Ch4Lab() {
  if (process.env.NODE_ENV === 'production') notFound();

  return (
    <main className="min-h-dvh overflow-x-clip bg-[#161311] px-4 pb-32 pt-12 text-[#F2EDE8] sm:px-8">
      <style>{LAB_CSS}</style>
      <div className="mx-auto max-w-[1240px]">
        <a href="/story-lab" className="figure text-[11px] uppercase tracking-[0.14em] text-[#A08E84] hover:text-[#F2EDE8]">
          ← Story lab
        </a>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.03em]">Ch3 Connect · Ch4 The Calendar</h1>
        <p className="mt-3 max-w-[64ch] text-[15px] leading-relaxed text-[#BCADA3]">
          Every app-UI mock the two chapters use, in every key frame, inside its frame and at its 3D rest pose. Every
          string comes from strings/ch3.ts and strings/ch4.ts and is proven against the app. Mika’s post and
          booking are drawn on the web and on her phone; Ernie’s chat, the thread and all of Ch4 are on the phone. Check
          at 375 and 1440.
        </p>

        {/* ── 3D proof first: the slabs turn, the flips run in place. ── */}
        <Section
          n="00 · §1.13"
          title="Depth and in-place flips"
          note="Slabs turn on a gentle turntable (±10° on phones, ±16° with a lift on desktop) and their sheens crossfade. Inside, the flips are opacity on stacked faces and every move is a translate: Invited → Going one by one, with the guest list re-sorting as the API sends it (going first, then by name) by sliding rows to their slots; 6:30 → 6:00 as a roll; the message going out plain, then sent with @Kenn picked out, the ticks stepping sent → delivered → read; Waiting on them → Agreed; roles open → filled; the agenda counting who is going; Saturday selected. No layout, filter or paint animates."
        >
          <div className="grid items-center justify-items-center gap-x-5 gap-y-16 md:grid-cols-2 xl:grid-cols-3">
            <div className="m2-turn m2-flip w-[min(100%,400px)]" style={{ '--delay': '0s' } as CSSProperties}>
              <Phone time="9:20" width="w-full">
                <EventDetail state="invited" />
              </Phone>
            </div>
            <div className="m2-turn m2-flip w-[min(100%,400px)]" style={{ '--delay': '-2.6s' } as CSSProperties}>
              <Phone time="1:04" width="w-full" i={1}>
                <GroupThread state="read" />
              </Phone>
            </div>
            <div className="m2-turn m2-flip w-[min(100%,400px)]" style={{ '--delay': '-5.2s' } as CSSProperties}>
              <Phone time="9:20" width="w-full">
                <div className="flex h-full flex-col gap-5 px-5 pt-4">
                  <MonthGrid state="today" view="week" />
                  <DayAgenda state="going" />
                </div>
              </Phone>
            </div>
            <div className="m2-turn m2-flip w-[min(100%,400px)]" style={{ '--delay': '-7.8s' } as CSSProperties}>
              <Phone time="12:58" width="w-full" i={1}>
                <div className="px-5 pt-2">
                  <ApplicantsCard platform="phone" state="kenn" />
                </div>
              </Phone>
            </div>
            <div className="m2-turn m2-flip w-[min(100%,400px)]" style={{ '--delay': '-4s' } as CSSProperties}>
              <Phone time="12:59" width="w-full">
                <ChatScreen title={DIRECT.title} placeholder={THREAD.placeholderDirect}>
                  <HiredTermsCard side="creative" state="confirmed" className="my-1.5" />
                </ChatScreen>
              </Phone>
            </div>
            <div className="m2-turn m2-flip w-full max-w-[420px]" style={{ '--delay': '-9s' } as CSSProperties}>
              <Browser url="web.virgo.ph/jobs/mine">
                <BookingBadge side="poster" state="waiting" />
              </Browser>
            </div>
          </div>
        </Section>

        {/* ── Ch3 ── */}
        <Section
          n="01 · Ch3 · web + phone"
          title="ApplicantRow, in the post’s card"
          note="Mika’s posted job on the web, opened. The applicants are newest first, as the API sends them (Bea, Kenn, Ernie), so Mika accepts from the bottom up. Role badges turn from open to filled as each person is accepted, the “N new” pill counts down, and each accepted row prints the raw status (“accepted”) with the booking the acceptance created and Open chat. The post stays Open with every role filled: the app takes it off the board and leaves Mark filled to her. The accepting key frame is the real in-flight state: spinner, buttons disabled."
        >
          <div className="grid gap-x-10 gap-y-16 lg:grid-cols-2">
            {APPLICANT_BEATS.map((b, i) => (
              <Specimen key={b.caption} caption={`web · ${b.caption}`}>
                <Browser url="web.virgo.ph/jobs/mine" i={i}>
                  <ApplicantsCard state={b.state} accepting={b.accepting} />
                </Browser>
              </Specimen>
            ))}
          </div>
          <p className="mt-20 max-w-[72ch] text-[14px] leading-relaxed text-[#BCADA3]">
            The same post on Mika’s phone (the Posted tab), for mobile Ch3’s phone-styled sheet: role pills, the
            applicant count as a link, Accept as a 44 px pill, the status in uppercase emerald, the booking as a
            bordered line.
          </p>
          <div className={`mt-10 ${PHONE_GRID}`}>
            {APPLICANT_BEATS.map((b, i) => (
              <Specimen key={b.caption} caption={`phone · ${b.caption}`}>
                <Phone time="12:58" i={i}>
                  <div className="px-5 pt-2">
                    <ApplicantsCard platform="phone" state={b.state} accepting={b.accepting} />
                  </div>
                </Phone>
              </Specimen>
            ))}
          </div>
        </Section>

        <Section
          n="02 · Ch3 · phone + web"
          title="HiredTermsCard, both sides, never mixed"
          note="The chat’s first message. On Ernie’s phone (hired): “They set these terms…”, Confirm these terms, then “You confirmed these terms.” On Mika’s (poster): “They have not confirmed these terms yet.”, then “They confirmed these terms.”, with Change the terms. 12/12/2026 is toLocaleDateString(); ₱25,000 is the top of the Videographer budget."
        >
          <div className={PHONE_GRID}>
            {(['needs-you', 'confirming', 'confirmed'] as const).map((state, i) => (
              <Specimen key={state} caption={`phone · creative · ${state}${state === 'confirmed' ? ' (default)' : ''}`}>
                <Phone time="12:59" i={i}>
                  <ChatScreen title={DIRECT.title} placeholder={THREAD.placeholderDirect}>
                    <HiredTermsCard side="creative" state={state} className="my-1.5" />
                  </ChatScreen>
                </Phone>
              </Specimen>
            ))}
            {(['waiting', 'agreed'] as const).map((state, i) => (
              <Specimen key={state} caption={`phone · poster · ${state}${state === 'agreed' ? ' (default)' : ''}`}>
                <Phone time="1:00" i={i + 1}>
                  <ChatScreen title={APPLICANT.ernie.name} placeholder={THREAD.placeholderDirect}>
                    <HiredTermsCard side="poster" state={state} className="my-1.5" />
                  </ChatScreen>
                </Phone>
              </Specimen>
            ))}
          </div>
          <div className="mt-20 grid gap-x-10 gap-y-14 md:grid-cols-2 xl:grid-cols-3">
            {(['needs-you', 'confirming', 'confirmed'] as const).map((state, i) => (
              <Specimen key={state} caption={`web · creative · ${state}`}>
                <Browser url="web.virgo.ph/chat" i={i} className="max-w-[460px]">
                  <HiredTermsCard platform="web" side="creative" state={state} className="mx-auto" />
                </Browser>
              </Specimen>
            ))}
            {(['waiting', 'agreed'] as const).map((state, i) => (
              <Specimen key={state} caption={`web · poster · ${state}`}>
                <Browser url="web.virgo.ph/chat" i={i + 1} className="max-w-[460px]">
                  <HiredTermsCard platform="web" side="poster" state={state} className="mx-auto" />
                </Browser>
              </Specimen>
            ))}
          </div>
        </Section>

        <Section
          n="03 · Ch3 · web + phone"
          title="BookingBadge"
          note="booking-card.tsx’s compact card on the web: the tone circle, “Booking”, the detail line and the badge flip in place (faces), so Waiting on them → Agreed is an opacity change with nothing moving. The phone’s link reads “Booking · waiting on them”, in #D18A5A for AA."
        >
          <div className="grid gap-x-10 gap-y-14 md:grid-cols-2">
            {(
              [
                ['poster', 'waiting'],
                ['poster', 'agreed'],
                ['creative', 'needs-you'],
                ['creative', 'agreed'],
              ] as const
            ).map(([side, state], i) => (
              <Specimen key={`${side}-${state}`} caption={`web · ${side} · ${state}`}>
                <Browser url="web.virgo.ph/jobs/mine" i={i} className="max-w-[520px]">
                  {side === 'poster' ? (
                    <BookingBadge side="poster" state={state as 'waiting' | 'agreed'} />
                  ) : (
                    <BookingBadge side="creative" state={state as 'needs-you' | 'agreed'} />
                  )}
                </Browser>
              </Specimen>
            ))}
          </div>
          <div className={`mt-16 ${PHONE_GRID}`}>
            {(
              [
                ['poster', 'waiting'],
                ['poster', 'agreed'],
                ['creative', 'needs-you'],
                ['creative', 'agreed'],
              ] as const
            ).map(([side, state], i) => (
              <Specimen key={`${side}-${state}`} caption={`phone · ${side} · ${state}`}>
                <Phone ratio={0} i={i} time="1:00" width="w-[min(100%,260px)]">
                  <div className="px-4 pb-8 pt-2">
                    {side === 'poster' ? (
                      <BookingBadge platform="phone" side="poster" state={state as 'waiting' | 'agreed'} />
                    ) : (
                      <BookingBadge platform="phone" side="creative" state={state as 'needs-you' | 'agreed'} />
                    )}
                  </div>
                </Phone>
              </Specimen>
            ))}
          </div>
        </Section>

        <Section
          n="04 · Ch3 · phone"
          title="GroupThread + Bubble"
          note="Mika’s phone. “@Kenn” is bold #FFE6D5 on her bubble once it is sent (going out, the app draws its optimistic row: the body plain, “Sending…”, a clock, the bubble at 85%); Kenn’s reply quotes it with a #B66A40 rail. Her marks: one tick, two dim ticks (delivered to all), Kenn has read it (“1”), everyone has (“3”, solid ticks). Members are listed by name, Mika included, as the API orders them. Text only."
        >
          <div className={PHONE_GRID}>
            {THREAD_STATES.map((state, i) => (
              <Specimen key={state} caption={`${state}${state === 'read' ? ' (default)' : ''}`}>
                <Phone time={state === 'replied' || state === 'read' ? '1:06' : '1:04'} i={i}>
                  <GroupThread state={state} />
                </Phone>
              </Specimen>
            ))}
          </div>
        </Section>

        <Section
          n="05 · Ch3 · shared row"
          title="Ch3 notifications"
          note="From hiring.service.ts, through the shared NotificationRow. Mika’s three New application cards and the last one, “Every role is filled”; Ernie’s “Application accepted”."
        >
          <div className="grid items-start gap-x-10 gap-y-14 lg:grid-cols-2">
            <Specimen caption="web · Mika · newest first">
              <Browser url="web.virgo.ph/notifications" className="max-w-[560px]">
                <NotificationList platform="web" heading={TODAY}>
                  {[NOTICES_CH3.filled, NOTICES_CH3.appliedBea, NOTICES_CH3.appliedKenn, NOTICES_CH3.appliedErnie].map((n, i) => (
                    <NotificationRow key={n.body} platform="web" state={i < 2 ? 'unread' : 'read'} {...n} />
                  ))}
                </NotificationList>
              </Browser>
            </Specimen>
            <div className="grid justify-items-center gap-14 sm:grid-cols-2">
              <Specimen caption="phone · Mika · arriving">
                <Phone ratio={0} time="12:31" width="w-[min(100%,260px)]">
                  <div className="pb-8">
                    <NotificationList platform="phone">
                      <NotificationRow platform="phone" first {...NOTICES_CH3.appliedErnie} />
                    </NotificationList>
                  </div>
                </Phone>
              </Specimen>
              <Specimen caption="phone · Ernie · accepted">
                <Phone ratio={0} time="12:58" i={1} width="w-[min(100%,260px)]">
                  <div className="pb-8">
                    <NotificationList platform="phone">
                      <NotificationRow platform="phone" first {...NOTICES_CH3.accepted} />
                    </NotificationList>
                  </div>
                </Phone>
              </Specimen>
            </div>
          </div>
        </Section>

        {/* ── Ch4 ── */}
        <Section
          n="06 · Ch4 · phone"
          title="MonthGrid + DayAgenda"
          note="getMonthWeeks for December 2026, Sunday first, with today pinned to the chapter’s Friday 11 (action fill). Tapping Saturday 12 selects it (primary at 15%) and the agenda under the card turns from Friday’s empty day to “Tomorrow” and the wedding. Mobile Ch4 shrinks the grid to the wedding’s week: the second row shows it beat by beat, the summary counting acceptances and the time rolling 6:30 → 6:00."
        >
          <div className={PHONE_GRID}>
            <Specimen caption="month · today · Friday’s empty day">
              <Phone time="9:18">
                <div className="flex h-full flex-col gap-5 px-5 pt-3">
                  <MonthGrid state="today" />
                  <DayAgenda state="empty" />
                </div>
              </Phone>
            </Specimen>
            <Specimen caption="month · selected (default) · the wedding">
              <Phone time="9:19" i={1}>
                <div className="flex h-full flex-col gap-5 px-5 pt-3">
                  <MonthGrid state="selected" />
                  <DayAgenda state="invited" />
                </div>
              </Phone>
            </Specimen>
            <Specimen caption="week · today">
              <Phone time="9:18" ratio={0}>
                <div className="px-5 pb-8 pt-3">
                  <MonthGrid state="today" view="week" />
                </div>
              </Phone>
            </Specimen>
            <Specimen caption="week · selected">
              <Phone time="9:19" ratio={0} i={1}>
                <div className="px-5 pb-8 pt-3">
                  <MonthGrid state="selected" view="week" />
                </div>
              </Phone>
            </Specimen>
          </div>
          <div className={`mt-16 ${PHONE_GRID}`}>
            {EVENT_BEATS.map((beat, i) => (
              <Specimen key={beat} caption={`week + agenda · ${beat}${beat === 'reminded' ? ' (default)' : ''}`}>
                <Phone time="9:20" ratio={0} i={i}>
                  <div className="flex flex-col gap-5 px-5 pb-8 pt-3">
                    <MonthGrid state="selected" view="week" />
                    <DayAgenda state={beat} />
                  </div>
                </Phone>
              </Specimen>
            ))}
          </div>
        </Section>

        <Section
          n="07 · Ch4 · phone"
          title="EventDetail + Attendees"
          note="The event on Mika’s phone. “Who’s coming” (curly apostrophe, the phone’s wording): Invited #A89489 → Going #6B8E4E as Ernie, Kenn and Bea say yes. The list is in the API’s order, going first and then by name, so it re-sorts at each yes: Bea, Ernie, Kenn; Ernie first; Ernie, Kenn, Bea; Bea, Ernie, Kenn again. Each row is moved to its slot with a translateY, so the reshuffle animates on the compositor. The move rolls the minutes under a fixed “6:” and “ AM”. The screen runs past the phone, as the app’s does; Reminders gains Mika’s row in the last beat."
        >
          <div className={PHONE_GRID}>
            {EVENT_BEATS.map((beat, i) => (
              <Specimen key={beat} caption={`${beat}${beat === 'reminded' ? ' (default)' : ''}`}>
                <Phone time="9:20" i={i}>
                  <EventDetail state={beat} />
                </Phone>
              </Specimen>
            ))}
          </div>
        </Section>

        <Section
          n="08 · Ch4 · shared row + generic chrome"
          title="Acceptances, the move, the email subject"
          note="Mika hears each yes (event-attendees.service.ts: “Ernie accepted your invitation”). The crew hear the move with the API’s ISO date and 24-hour time; desktop adds the email subject from mail.templates.ts eventChanged. The inbox chip around it is generic chrome."
        >
          <div className="grid items-start justify-items-center gap-x-12 gap-y-14 md:grid-cols-2 xl:grid-cols-3">
            <Specimen caption="phone · Mika · acceptances">
              <Phone ratio={0} time="10:12" width="w-[min(100%,280px)]">
                <div className="pb-8">
                  <NotificationList platform="phone" heading={TODAY}>
                    {[NOTICES_CH4.acceptedBea, NOTICES_CH4.acceptedKenn, NOTICES_CH4.acceptedErnie].map((n, i) => (
                      <NotificationRow key={n.title} platform="phone" first={i === 0} state={i === 0 ? 'unread' : 'read'} {...n} />
                    ))}
                  </NotificationList>
                </div>
              </Phone>
            </Specimen>
            <Specimen caption="phone · a crew member · the move">
              <Phone ratio={0} time="9:20" i={1} width="w-[min(100%,280px)]">
                <div className="pb-8">
                  <NotificationList platform="phone" heading={TODAY}>
                    <NotificationRow platform="phone" first {...NOTICES_CH4.moved} />
                  </NotificationList>
                </div>
              </Phone>
            </Specimen>
            <div className="flex w-full max-w-[440px] flex-col gap-14 px-2">
              <Specimen caption="EmailSubjectChip · unread (default)">
                <Slab className="w-full" rotateX={6} rotateY={-6} depth={6} radius="rounded-2xl" edge="card">
                  <EmailSubjectChip state="unread" />
                </Slab>
              </Specimen>
              <Specimen caption="EmailSubjectChip · read">
                <Slab className="w-full" rotateX={6} rotateY={6} depth={6} radius="rounded-2xl" edge="card">
                  <EmailSubjectChip state="read" />
                </Slab>
              </Specimen>
            </div>
          </div>
        </Section>

        <Section
          n="09 · Ch4 · phone"
          title="ReminderSheet, then it rings"
          note="New reminder from the event: “for Reyes & Santos wedding”. The time already reads 5:00 AM (the app starts an hour before a timed event) and both alerts are on by default; Create reminder fills once there is a title. Then the signature beat on the generic lock screen: zero bars, 5:00, the reminder’s title and notes."
        >
          <div className={PHONE_GRID}>
            {REMINDER_STATES.map((state, i) => (
              <Specimen key={state} caption={`${state}${state === 'filled' ? ' (default)' : ''}`}>
                <Phone time="9:24" i={i}>
                  <ReminderSheet state={state} />
                </Phone>
              </Specimen>
            ))}
            <Specimen caption="lock screen · 0 bars · it rings">
              <Phone time="5:00" signal={0} screen={LOCK_WALLPAPER} i={1}>
                <LockScreen time={lockTime(WHEN.reminder)} date={lockDate(WHEN.reminder)}>
                  <LockNotification title={RINGS.title} body={RINGS.body} />
                </LockScreen>
              </Phone>
            </Specimen>
          </div>
        </Section>
      </div>
    </main>
  );
}
