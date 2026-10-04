import type { ReactNode } from 'react';
import { WHEN } from '../../data/story';
import { GUEST_NAME, GUESTS, NOTICES_CH4, RINGS, guestList, type Guest } from '../../data/strings/ch4';
import { TODAY } from '../../data/strings/common';
import { CH4 } from '../../data/strings/page-ch4';
import { LOCK_WALLPAPER, LockNotification, LockScreen, Perspective, PHONE_RADIUS, PhoneFrame, Slab, lockDate, lockTime } from '../../frames';
import { Avatar } from '../../mocks/avatar';
import { EmailSubjectChip } from '../../mocks/email-subject-chip';
import { ATTENDEE_ROW, EventDetail } from '../../mocks/event-detail';
import { DayAgenda, MonthGrid } from '../../mocks/month-grid';
import { NotificationList, NotificationRow } from '../../mocks/notification-row';
import { ReminderSheet } from '../../mocks/reminder-sheet';
import { Ch4Stage } from '../islands/ch4';

/**
 * Ch4 — The Calendar · #calendar (storyboard §2 Ch4).
 *
 * Night, on its own opaque surface (the sky stops behind it). The static
 * render is the reduced-motion page: three still frames (Going ×3, the move
 * reaching the crew, the 5:00 AM ring with no service) and a still copper
 * horizon. With motion, one sticky phone plays the beats and the island
 * (islands/ch4.tsx) drives them from scroll.
 */

/** Each guest row's translateY after 0–3 acceptances: the API re-sorts the list (going first, then by name). */
function slotShifts(): Record<Guest, number[]> {
  const drawn = guestList(0).map((s) => s.guest);
  const out = {} as Record<Guest, number[]>;
  drawn.forEach((g, i) => {
    out[g] = [0, 1, 2, 3].map((n) => (guestList(n).findIndex((s) => s.guest === g) - i) * ATTENDEE_ROW);
  });
  return out;
}

const M_TRACK = "[html[data-motion='on']_&]:min-h-[170svh] lg:[html[data-motion='on']_&]:min-h-[160svh]";

/** A phone at its rest pose, for the still frames. */
function StillPhone({ children, rotateY, time, signal, screen }: { children: ReactNode; rotateY: number; time: string; signal?: 0 | 4; screen?: string }) {
  return (
    <Slab className="w-[min(100%,340px)]" rotateX={5} rotateY={rotateY} depth={14} radius={PHONE_RADIUS} edge="device" shadow="floor">
      <PhoneFrame width="100%" time={time} signal={signal} screen={screen} ratio={0}>
        <div className="relative h-[560px] overflow-hidden">{children}</div>
      </PhoneFrame>
    </Slab>
  );
}

function StillFrames() {
  return (
    <figure className="static-only mt-14 max-lg:order-2 lg:mt-20">
      <div aria-hidden className="grid items-start justify-items-center gap-x-8 gap-y-16 lg:grid-cols-3">
        <div className="flex w-full flex-col items-center gap-6">
          <StillPhone rotateY={-8} time="9:20">
            <EventDetail state="going" />
          </StillPhone>
          <p className="max-w-[30ch] text-center font-mono text-[12px] uppercase leading-relaxed tracking-[0.12em] text-[#A08E84]">{CH4.stills.going}</p>
        </div>
        <div className="flex w-full flex-col items-center gap-6 lg:pt-24">
          <div className="flex w-full max-w-[340px] flex-col gap-5">
            <Slab className="w-full" rotateX={6} rotateY={-6} depth={8} radius="rounded-[24px]" edge="card">
              <NotificationList platform="phone" heading={TODAY}>
                <NotificationRow platform="phone" first {...NOTICES_CH4.moved} />
              </NotificationList>
            </Slab>
            <Slab className="w-full" rotateX={6} rotateY={6} depth={6} radius="rounded-2xl" edge="card">
              <EmailSubjectChip state="unread" />
            </Slab>
          </div>
          <p className="max-w-[30ch] text-center font-mono text-[12px] uppercase leading-relaxed tracking-[0.12em] text-[#A08E84]">{CH4.stills.moved}</p>
        </div>
        <div className="flex w-full flex-col items-center gap-6">
          <StillPhone rotateY={8} time="5:00" signal={0} screen={LOCK_WALLPAPER}>
            <LockScreen time={lockTime(WHEN.reminder)} date={lockDate(WHEN.reminder)}>
              <LockNotification title={RINGS.title} body={RINGS.body} />
            </LockScreen>
          </StillPhone>
          <p className="max-w-[30ch] text-center font-mono text-[12px] uppercase leading-relaxed tracking-[0.12em] text-[#A08E84]">{CH4.stills.rings}</p>
        </div>
      </div>
      <figcaption className="sr-only">{CH4.caption}</figcaption>
    </figure>
  );
}

/** The screen height inside the sticky phone: the top 54 svh on phones, most of the viewport on desktop. */
const SCREEN_H = 'h-[calc(54svh-46px)] lg:h-[min(660px,calc(100svh-190px))]';

function LivePhone() {
  return (
    <div data-part="c4-phone" className="relative z-10 w-full max-w-[400px] lg:w-[340px]">
      <Slab className="w-full" rotateX={8} rotateY={-12} depth={14} radius={PHONE_RADIUS} edge="device" shadow="floor">
        <div className="relative">
          <PhoneFrame width="100%" time="9:20" ratio={0}>
            <div className={`relative overflow-hidden ${SCREEN_H}`}>
              <div data-part="c4-cal" className="absolute inset-0 flex flex-col gap-5 px-5 pt-3">
                <MonthGrid state="selected" view="month" className="hidden lg:block" />
                <MonthGrid state="selected" view="week" className="lg:hidden" />
                <DayAgenda state="invited" />
              </div>
              <div data-part="c4-event" className="absolute inset-0" style={{ opacity: 0 }}>
                <EventDetail state="reminded" />
              </div>
              <div data-part="c4-toast" className="absolute inset-x-2 top-1 z-20" style={{ opacity: 0 }}>
                <NotificationList platform="phone" className="shadow-[0_18px_40px_-18px_rgba(0,0,0,0.9)]">
                  <NotificationRow platform="phone" first {...NOTICES_CH4.acceptedErnie} />
                </NotificationList>
              </div>
              <div data-part="c4-sheet" className="absolute inset-0 z-10" style={{ opacity: 0, transform: 'translate3d(0,100%,0)' }}>
                <ReminderSheet state="filled" className="rounded-t-[22px] shadow-[0_-20px_40px_-20px_rgba(0,0,0,0.8)]" />
              </div>
            </div>
          </PhoneFrame>
          <div data-part="c4-lock" className="absolute inset-0 z-20" style={{ opacity: 0 }}>
            <PhoneFrame width="100%" time="5:00" signal={0} screen={LOCK_WALLPAPER} ratio={0}>
              <div className={`relative ${SCREEN_H}`}>
                <LockScreen time={lockTime(WHEN.reminder)} date={lockDate(WHEN.reminder)} className="!pt-[8%]">
                  <LockNotification title={RINGS.title} body={RINGS.body} />
                </LockScreen>
              </div>
            </PhoneFrame>
          </div>
        </div>
      </Slab>
    </div>
  );
}

/** The sticky figure (motion only): the phone, the crew's notices, the rings. */
function LiveFigure() {
  const crew: Guest[] = [...GUESTS];
  return (
    <div
      data-part="c4-stage"
      aria-hidden
      className="motion-only sticky top-14 z-0 -mx-2 max-lg:order-2 flex h-[54svh] items-start justify-center overflow-x-clip lg:top-0 lg:col-span-6 lg:col-start-7 lg:row-start-1 lg:mx-0 lg:h-svh lg:items-center lg:justify-end lg:pr-4"
    >
      {/* "5:00", behind everything, for the ring. */}
      <p
        data-part="c4-display"
        className="pointer-events-none absolute right-[186px] top-1/2 hidden translate-x-1/2 -translate-y-1/2 select-none text-[clamp(3.5rem,19vw,14rem)] font-semibold leading-[0.86] tracking-[-0.05em] text-[rgba(209,138,90,0.2)] tabular-nums lg:block"
        style={{ opacity: 0 }}
      >
        {CH4.display}
      </p>
      {/* Two sound rings (≤ 2 cycles; stopped under Pause). */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 flex size-0 items-center justify-center lg:left-auto lg:right-[186px]">
        {[0, 1].map((i) => (
          <span
            key={i}
            data-part="c4-ring"
            className="absolute size-[460px] rounded-full border-2 border-[rgba(232,168,110,0.55)] shadow-[0_0_60px_-10px_rgba(232,168,110,0.35),inset_0_0_60px_-10px_rgba(232,168,110,0.25)]"
            style={{ opacity: 0 }}
          />
        ))}
      </div>

      <Perspective className="pointer-events-none absolute inset-0 z-20" origin="70% 40%">
        {crew.map((g, i) => (
          <div
            key={g}
            data-part={`c4-card-${i}`}
            className={`absolute left-1/2 top-[34%] w-[min(88%,320px)] -translate-x-1/2 lg:left-auto lg:right-[290px] lg:top-[22%] lg:w-[300px] lg:translate-x-0 ${i > 0 ? 'hidden lg:block' : ''}`}
            style={{ opacity: 0 }}
          >
            <div className="lg:mt-[calc(var(--i)*92px)]" style={{ ['--i' as string]: i }}>
              <div className="mb-2 flex items-center gap-2 pl-1">
                <Avatar surface="phone-attendee" name={GUEST_NAME[g]} size={22} />
                <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#BCADA3]">{GUEST_NAME[g]}</span>
              </div>
              <NotificationList platform="phone" className="shadow-[0_24px_48px_-20px_rgba(0,0,0,0.95)] ring-1 ring-[rgba(242,237,232,0.08)]">
                <NotificationRow platform="phone" first {...NOTICES_CH4.moved} />
              </NotificationList>
            </div>
          </div>
        ))}
        <div data-part="c4-email" className="absolute bottom-[10%] right-[250px] hidden w-[360px] lg:block" style={{ opacity: 0 }}>
          <EmailSubjectChip state="unread" className="shadow-[0_24px_48px_-20px_rgba(0,0,0,0.95)]" />
        </div>
      </Perspective>

      <LivePhone />

      <p
        data-part="c4-slate"
        className="absolute bottom-6 right-4 hidden font-mono text-[12px] uppercase tracking-[0.14em] text-[#D18A5A] lg:block"
        style={{ opacity: 0 }}
      >
        <time dateTime={WHEN.reminder}>{CH4.slate}</time>
      </p>
    </div>
  );
}

const slots = slotShifts();

export function Ch4() {
  return (
    <section
      id="calendar"
      data-tone="night"
      data-chapter="calendar"
      className="relative z-10 bg-[#161311] bg-[radial-gradient(90%_50%_at_70%_0%,#1E1A17_0%,rgba(22,19,17,0)_70%)] pb-[24svh] pt-24 [overflow-x:clip] lg:pt-16"
    >
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <Ch4Stage className={`relative max-lg:flex max-lg:flex-col lg:grid lg:grid-cols-12 lg:gap-x-10 ${M_TRACK}`} slots={slots}>
          <LiveFigure />
          <div className="relative z-10 flex flex-col max-lg:contents lg:col-span-12 lg:col-start-1 lg:row-start-1 [html[data-motion='on']_&]:pt-[6svh] lg:[html[data-motion='on']_&]:col-span-6 lg:[html[data-motion='on']_&]:pb-[16svh] lg:[html[data-motion='on']_&]:pt-[22svh]">
            <div data-part="c4-copy-1" className="max-lg:order-1 max-lg:[html[data-motion='on']_&]:mb-[4svh] max-lg:[html[data-motion='on']_&]:rounded-3xl max-lg:[html[data-motion='on']_&]:bg-[rgba(22,19,17,0.94)] max-lg:[html[data-motion='on']_&]:p-5 max-lg:[html[data-motion='on']_&]:ring-1 max-lg:[html[data-motion='on']_&]:ring-[rgba(242,237,232,0.08)]">
              <p className="font-mono text-xs uppercase tracking-[0.14em] text-[#D18A5A]">{CH4.eyebrow}</p>
              <h2 className="mt-3 max-w-[18ch] text-[clamp(2rem,1.3rem+3.4vw,4.25rem)] font-semibold leading-none tracking-[-0.03em] text-[#F2EDE8]">
                {CH4.h2}
              </h2>
              <p className="mt-6 max-w-[34ch] text-base leading-[1.6] text-[#BCADA3] sm:max-w-[52ch] lg:text-[17px]">{CH4.body}</p>
            </div>

            <StillFrames />

            <div className="relative z-10 mt-16 max-lg:order-3 max-lg:[html[data-motion='on']_&]:mt-[88svh] max-lg:[html[data-motion='on']_&]:rounded-3xl max-lg:[html[data-motion='on']_&]:bg-[rgba(22,19,17,0.94)] max-lg:[html[data-motion='on']_&]:p-5 max-lg:[html[data-motion='on']_&]:ring-1 max-lg:[html[data-motion='on']_&]:ring-[rgba(242,237,232,0.08)] lg:mt-20 lg:[html[data-motion='on']_&]:mt-[72svh]">
              <h3 className="max-w-[24ch] text-[clamp(1.25rem,1.1rem+0.8vw,1.625rem)] font-semibold leading-[1.2] tracking-[-0.01em] text-[#F2EDE8]">
                {CH4.h3}
              </h3>
              <p className="mt-4 max-w-[34ch] text-base leading-[1.6] text-[#BCADA3] sm:max-w-[52ch] lg:text-[17px]">{CH4.body2}</p>
              <p className="mt-4 max-w-[52ch] text-sm leading-[1.55] text-[#A08E84]">{CH4.micro}</p>
              <p className="mt-8 max-w-[60ch] border-t border-[rgba(242,237,232,0.08)] pt-4 text-[13px] leading-[1.55] text-[#A08E84]">{CH4.footnote}</p>
            </div>
          </div>
          <p className="sr-only [html:not([data-motion='on'])_&]:hidden">{CH4.caption}</p>
        </Ch4Stage>
      </div>

      {/* The copper horizon: the first light on the page (still in the static page). */}
      <div aria-hidden data-part="c4-horizon" className="pointer-events-none absolute inset-x-0 bottom-0 h-[30svh] [html[data-motion='on']_&]:opacity-0">
        <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(107,62,37,0.95)_0%,rgba(107,62,37,0.55)_26%,rgba(61,36,24,0.25)_58%,rgba(22,19,17,0)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-px bg-[linear-gradient(90deg,rgba(232,168,110,0)_0%,rgba(240,200,142,0.9)_50%,rgba(232,168,110,0)_100%)]" />
        <div className="absolute inset-x-[10%] bottom-0 h-16 bg-[radial-gradient(50%_100%_at_50%_100%,rgba(240,200,142,0.35)_0%,rgba(240,200,142,0)_100%)]" />
      </div>
    </section>
  );
}
