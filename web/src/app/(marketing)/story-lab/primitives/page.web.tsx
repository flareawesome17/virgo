import type { CSSProperties, ReactNode } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { WHEN } from '@/components/story/data/story';
import { NOTICES, TODAY } from '@/components/story/data/strings/common';
import {
  BrowserFrame,
  BROWSER_RADIUS,
  DesktopWindow,
  desktopRadius,
  LOCK_WALLPAPER,
  LockNotification,
  LockScreen,
  lockDate,
  lockTime,
  Perspective,
  PHONE_RADIUS,
  PhoneFrame,
  Slab,
} from '@/components/story/frames';
import { Avatar, type AvatarSurface } from '@/components/story/mocks/avatar';
import { NotificationList, NotificationRow } from '@/components/story/mocks/notification-row';
import { Plate, type PlateAspect } from '@/components/story/mocks/plate';

/**
 * Frames, the 3D slab, avatars, plates and notification rows, every variant.
 */
export const metadata: Metadata = {
  title: 'Story lab · Primitives',
  robots: { index: false, follow: false },
};

const NOTES = [NOTICES.callMoved, NOTICES.picks, NOTICES.cleanedUp] as const;

/**
 * The lab's own motion: a turntable and a lift, to prove the slab turns on
 * the compositor alone (transform and opacity, nothing else). Phase 4 drives
 * the same parts from scroll instead. Reduced motion keeps the pose.
 */
const LAB_CSS = `
@keyframes lab-turn { 0%,100% { transform: rotateX(5deg) rotateY(-18deg) } 50% { transform: rotateX(5deg) rotateY(18deg) } }
@keyframes lab-turn-m { 0%,100% { transform: rotateX(4deg) rotateY(-10deg) } 50% { transform: rotateX(4deg) rotateY(10deg) } }
@keyframes lab-sheen-a { 0%,100% { opacity: 1 } 50% { opacity: 0 } }
@keyframes lab-sheen-b { 0%,100% { opacity: 0 } 50% { opacity: 1 } }
@keyframes lab-lift { 0%,100% { transform: rotateX(14deg) rotateY(-8deg) translateZ(0) } 50% { transform: rotateX(14deg) rotateY(-8deg) translateZ(60px) } }
@keyframes lab-lift-shadow { 0%,100% { transform: scale(1); opacity: 1 } 50% { transform: scale(1.1); opacity: .8 } }
@keyframes lab-fan { 0%,100% { transform: var(--rest) } 50% { transform: var(--rest) translateZ(var(--push)) } }
.lab-turn [data-part="slab-body"] { animation: lab-turn-m 9s cubic-bezier(.65,0,.35,1) infinite }
.lab-turn [data-part="slab-sheen-a"] { animation: lab-sheen-a 9s cubic-bezier(.65,0,.35,1) infinite }
.lab-turn [data-part="slab-sheen-b"] { animation: lab-sheen-b 9s cubic-bezier(.65,0,.35,1) infinite }
.lab-lift [data-part="slab-body"] { animation: lab-lift 6s cubic-bezier(.65,0,.35,1) infinite }
.lab-lift [data-part="slab-shadow"] { animation: lab-lift-shadow 6s cubic-bezier(.65,0,.35,1) infinite }
.lab-fan > * { animation: lab-fan 7s cubic-bezier(.65,0,.35,1) infinite; animation-delay: var(--delay) }
@media (min-width: 768px) { .lab-turn [data-part="slab-body"] { animation-name: lab-turn } }
@media (prefers-reduced-motion: reduce) { .lab-turn *, .lab-lift *, .lab-fan > * { animation: none !important } }
`;

function Section({ n, title, note, children }: { n: string; title: string; note: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-20 first:mt-14">
      <p className="figure text-[11px] uppercase tracking-[0.14em] text-[#D18A5A]">{n}</p>
      <h2 className="mt-1.5 text-2xl font-semibold tracking-[-0.02em]">{title}</h2>
      <p className="mt-2 max-w-[68ch] text-[14px] leading-relaxed text-[#BCADA3]">{note}</p>
      <div className="mt-8">{children}</div>
    </section>
  );
}

function Specimen({
  caption,
  children,
  className = '',
  day = false,
}: {
  caption: string;
  children: ReactNode;
  className?: string;
  /** On the paper ground: the light-ground muted ink (§1.5). */
  day?: boolean;
}) {
  return (
    <figure className={`flex min-w-0 flex-col items-center ${className}`}>
      <div className="flex w-full justify-center">{children}</div>
      <figcaption className={`figure mt-5 text-center text-[11px] leading-relaxed ${day ? 'text-[#6F5C52]' : 'text-[#A08E84]'}`}>
        {caption}
      </figcaption>
    </figure>
  );
}

function PhoneNotifications() {
  return (
    <NotificationList platform="phone" heading={TODAY} className="pt-1">
      {NOTES.map((n, i) => (
        <NotificationRow key={n.title} platform="phone" first={i === 0} state={i === 0 ? 'unread' : 'read'} {...n} />
      ))}
    </NotificationList>
  );
}

function PlateGrid({ count, cols = 3, gap = 2, from = 0 }: { count: number; cols?: number; gap?: number; from?: number }) {
  return (
    <div className="grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap }}>
      {Array.from({ length: count }, (_, i) => (
        <Plate key={i} seed={from + i} />
      ))}
    </div>
  );
}

const SURFACES: { surface: AvatarSurface; where: string }[] = [
  { surface: 'phone-nearby', where: 'phone · Nearby, mentions' },
  { surface: 'phone-chat', where: 'phone · chat list' },
  { surface: 'phone-attendee', where: 'phone · attendees' },
  { surface: 'web', where: 'web · Nearby, chat' },
  { surface: 'web-muted', where: 'web · applicants' },
  { surface: 'workspace', where: 'web · workspace faces' },
];
const PEOPLE = ['Mika Dizon', 'Ernie', 'Kenn', 'Bea'];
const ASPECTS: PlateAspect[] = ['1:1', '4:5', '3:2', '16:9'];

export default function PrimitivesLab() {
  if (process.env.NODE_ENV === 'production') notFound();

  return (
    <main className="min-h-dvh overflow-x-clip bg-[#161311] px-4 pb-32 pt-12 text-[#F2EDE8] sm:px-8">
      <style>{LAB_CSS}</style>
      <div className="mx-auto max-w-[1240px]">
        <a href="/story-lab" className="figure text-[11px] uppercase tracking-[0.14em] text-[#A08E84] hover:text-[#F2EDE8]">
          ← Story lab
        </a>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.03em]">Primitives</h1>
        <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-[#BCADA3]">
          The frames every chapter mounts its mocks in, the slab that gives them depth, and the shared avatars,
          plates and notification rows. Check at 375 and 1440: below 768 the phone loses its bezel, the desktop window
          its sidebar, and tilts stay under 10°.
        </p>

        <Section
          n="01 · §1.13"
          title="Slab: thickness, sheen, contact shadow"
          note="A back plate one depth behind the face shows as the edge when the slab turns; two sheen layers crossfade with the turn; the shadow is radial gradients, never a blur. Every motion here is transform or opacity."
        >
          <div className="grid gap-x-8 gap-y-16 md:grid-cols-3">
            <Specimen caption="rest · rotateY −10° rotateX 4° · depth 14">
              <Slab className="w-[min(100%,320px)]" rotateY={-10} rotateX={4} depth={14} radius={PHONE_RADIUS} edge="device" shadow="floor">
                <PhoneFrame width="100%" time="12:04">
                  <PhoneNotifications />
                </PhoneFrame>
              </Slab>
            </Specimen>
            <Specimen caption="turntable · ±18° desktop, ±10° phone · sheens crossfade">
              <Slab className="lab-turn w-[min(100%,320px)]" rotateY={-10} rotateX={5} depth={14} radius={PHONE_RADIUS} edge="device" shadow="floor">
                <PhoneFrame width="100%" time="5:00" signal={0} screen={LOCK_WALLPAPER}>
                  <LockScreen time={lockTime(WHEN.reminder)} date={lockDate(WHEN.reminder)}>
                    <LockNotification title={NOTICES.callMoved.title} body={NOTICES.callMoved.body} />
                  </LockScreen>
                </PhoneFrame>
              </Slab>
            </Specimen>
            <Specimen caption="rest · rotateY 10° rotateX 4° · depth 14">
              <Slab className="w-[min(100%,320px)]" rotateY={10} rotateX={4} depth={14} radius={PHONE_RADIUS} edge="device" shadow="floor">
                <PhoneFrame width="100%" time="4:50" tone="dark" screen="#FBF7F2">
                  <div className="px-3 pt-2">
                    <PlateGrid count={18} from={3} />
                  </div>
                </PhoneFrame>
              </Slab>
            </Specimen>
          </div>

          <div className="mt-20 grid items-center gap-x-10 gap-y-16 md:grid-cols-2">
            <Specimen caption="card slab · lift translateZ 0 → 60 · shadow scales and fades">
              <Slab className="lab-lift w-full max-w-[440px]" rotateX={14} rotateY={-8} depth={8} radius="rounded-xl" edge="card">
                <NotificationList platform="web" heading={TODAY}>
                  {NOTES.map((n, i) => (
                    <NotificationRow key={n.title} platform="web" state={i < 2 ? 'unread' : 'read'} {...n} />
                  ))}
                </NotificationList>
              </Slab>
            </Specimen>
            <Specimen caption="Perspective scene · cards fanned back on z, one eye">
              <Perspective className="lab-fan relative grid h-[260px] w-full max-w-[420px] place-items-center" origin="50% 20%">
                {NOTES.map((n, i) => (
                  <div
                    key={n.title}
                    className="col-start-1 row-start-1 w-full"
                    style={
                      {
                        '--rest': `translateY(${-i * 30}px) translateZ(${-i * 90}px) rotateX(8deg)`,
                        '--push': `${-20 - i * 10}px`,
                        '--delay': `${i * 0.06}s`,
                        transform: `translateY(${-i * 30}px) translateZ(${-i * 90}px) rotateX(8deg)`,
                        zIndex: NOTES.length - i,
                        opacity: 1 - i * 0.22,
                      } as CSSProperties
                    }
                  >
                    <NotificationList platform="web">
                      <NotificationRow platform="web" {...n} />
                    </NotificationList>
                  </div>
                ))}
              </Perspective>
            </Specimen>
          </div>

          {/* The day ground (Ch6), where contact shadows carry the depth that
              the sheen carries at night. */}
          <div className="mt-20 grid items-center gap-x-10 gap-y-14 rounded-2xl bg-[#FBF7F2] px-4 py-14 sm:px-10 md:grid-cols-2">
            <Specimen day caption="paper edge · drop shadow · rotateX 10° rotateY 8°">
              <Slab className="w-full max-w-[400px]" rotateX={10} rotateY={8} depth={6} radius="rounded-2xl" edge="paper">
                <div className="bg-white p-3">
                  <PlateGrid count={6} gap={6} from={20} />
                </div>
              </Slab>
            </Specimen>
            <Specimen day caption="device edge · floor shadow · on paper">
              <Slab className="w-[min(100%,260px)]" rotateY={-10} rotateX={3} depth={14} radius={PHONE_RADIUS} edge="device" shadow="floor">
                <PhoneFrame width="100%" time="4:50" tone="dark" screen="#FBF7F2">
                  <div className="px-3 pt-2">
                    <PlateGrid count={12} from={7} />
                  </div>
                </PhoneFrame>
              </Slab>
            </Specimen>
          </div>
        </Section>

        <Section
          n="02 · B9"
          title="Phone"
          note="OS-neutral: status bar, camera dot, home indicator. No bezel below 768, a slim one above. Zero bars prints “No service”. Light ink on dark screens, dark ink on the client page’s paper."
        >
          <div className="grid gap-x-8 gap-y-14 sm:grid-cols-2 xl:grid-cols-4">
            <Specimen caption="4 bars · wifi · 12:04">
              <PhoneFrame width="min(100%, 290px)" time="12:04" wifi>
                <PhoneNotifications />
              </PhoneFrame>
            </Specimen>
            <Specimen caption="0 bars · No service · lock screen">
              <PhoneFrame width="min(100%, 290px)" time="5:00" signal={0} screen={LOCK_WALLPAPER} battery={0.41}>
                <LockScreen time={lockTime(WHEN.reminder)} date={lockDate(WHEN.reminder)}>
                  <LockNotification title={NOTICES.callMoved.title} body={NOTICES.callMoved.body} />
                </LockScreen>
              </PhoneFrame>
            </Specimen>
            <Specimen caption="2 bars · dark ink on paper">
              <PhoneFrame width="min(100%, 290px)" time="4:50" signal={2} tone="dark" screen="#FBF7F2" battery={0.15}>
                <div className="px-3 pt-2">
                  <PlateGrid count={15} from={11} />
                </div>
              </PhoneFrame>
            </Specimen>
            <Specimen caption="ratio 0 · content sets the height">
              <PhoneFrame width="min(100%, 290px)" time="8:15" ratio={0} homeIndicator={false}>
                <div className="pb-4">
                  <NotificationList platform="phone">
                    <NotificationRow platform="phone" first {...NOTICES.picks} />
                  </NotificationList>
                </div>
              </PhoneFrame>
            </Specimen>
          </div>
        </Section>

        <Section
          n="03 · B9"
          title="Browser and desktop app"
          note="Web dark throughout: Geist, #161311, primary #D18A5A on #161311. The desktop window is Virgo's own chrome — the Tauri title bar (Windows caption buttons, or room for the macOS lights) and the app shell's sidebar, which steps aside below 768."
        >
          <div className="grid gap-16">
            <Specimen caption="BrowserFrame · url prop">
              <Slab className="w-full max-w-[760px]" rotateX={6} depth={10} radius={BROWSER_RADIUS} edge="card">
                <BrowserFrame url="web.virgo.ph/notifications" viewportClassName="p-4 sm:p-6">
                  <NotificationList platform="web" heading={TODAY}>
                    {NOTES.map((n, i) => (
                      <NotificationRow key={n.title} platform="web" state={i === 0 ? 'unread' : 'read'} {...n} />
                    ))}
                  </NotificationList>
                </BrowserFrame>
              </Slab>
            </Specimen>
            <div className="grid gap-16 xl:grid-cols-2">
              <Specimen caption="DesktopWindow · windows · Albums active">
                <Slab className="w-full" rotateY={-6} rotateX={4} depth={10} radius={desktopRadius('windows')} edge="card">
                  <DesktopWindow os="windows" active="albums" contentClassName="h-[360px] overflow-hidden p-4">
                    <PlateGrid count={24} cols={4} />
                  </DesktopWindow>
                </Slab>
              </Specimen>
              <Specimen caption="DesktopWindow · macos · badges">
                <Slab className="w-full" rotateY={6} rotateX={4} depth={10} radius={desktopRadius('macos')} edge="card">
                  <DesktopWindow
                    os="macos"
                    active="notifications"
                    badges={{ notifications: 1, chat: 2, schedule: 1 }}
                    contentClassName="h-[360px] overflow-hidden p-4"
                  >
                    <NotificationList platform="web" heading={TODAY}>
                      {NOTES.map((n, i) => (
                        <NotificationRow key={n.title} platform="web" state={i === 0 ? 'unread' : 'read'} {...n} />
                      ))}
                    </NotificationList>
                  </DesktopWindow>
                </Slab>
              </Specimen>
            </div>
          </div>
        </Section>

        <Section
          n="04 · B8"
          title="Avatars"
          note="Tinted, never solid, per surface as the app draws them. Phone letters are #D18A5A for contrast (§1.5). Under 28 px a two-letter surface shows one letter, so no text falls under 11 px."
        >
          <div className="overflow-hidden rounded-xl border border-[#362F2B]">
            {SURFACES.map(({ surface, where }) => (
              <div
                key={surface}
                className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-[#362F2B] bg-[#1A1715] px-4 py-4 last:border-b-0 sm:flex-nowrap"
              >
                <div className="w-full sm:w-52 sm:shrink-0">
                  <p className="figure text-[12px] text-[#F2EDE8]">{surface}</p>
                  <p className="text-[12px] text-[#A08E84]">{where}</p>
                </div>
                <div className="flex items-center gap-3">
                  {PEOPLE.map((name) => (
                    <Avatar key={name} surface={surface} name={name} />
                  ))}
                </div>
                <div className="flex items-center -space-x-1.5">
                  {PEOPLE.map((name) => (
                    <Avatar key={name} surface={surface} name={name} size={24} ring="#1A1715" />
                  ))}
                </div>
                <Avatar surface={surface} name="Ernie" size={18} ring="#1A1715" />
              </div>
            ))}
          </div>
        </Section>

        <Section
          n="05 · B7"
          title="Plates"
          note="Abstract photo stand-ins, seeded, never people. Lite: one element, four background layers, baked grain, no blend or filter — for grids and anything that moves. Full: the landing page’s plate, with its overlay grain."
        >
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {ASPECTS.map((aspect, i) => (
              <div key={aspect} className="flex flex-col gap-2">
                <Plate seed={i * 2} aspect={aspect} className="rounded-lg" label={`lite · ${aspect}`} index={String(i * 2).padStart(2, '0')} />
                <Plate seed={i * 2} aspect={aspect} variant="full" className="rounded-lg" label={`full · ${aspect}`} />
              </div>
            ))}
          </div>
          <div className="mt-6 grid grid-cols-5 gap-[2px] md:grid-cols-10">
            {Array.from({ length: 20 }, (_, i) => (
              <Plate key={i} seed={i} index={String(i).padStart(2, '0')} />
            ))}
          </div>
        </Section>

        <Section
          n="06 · shared"
          title="Notification rows"
          note="Web follows the bell and the notifications page; phone follows the app's list. Unread rows carry the tint, the bold title and the dot. Albums tint chart-3 on the web and the brand accent on the phone, as the apps do."
        >
          <div className="grid gap-10 lg:grid-cols-2">
            <div className="flex flex-col gap-6">
              <p className="figure text-[11px] uppercase tracking-[0.14em] text-[#A08E84]">web · unread</p>
              <NotificationList platform="web" heading={TODAY}>
                {NOTES.map((n) => (
                  <NotificationRow key={n.title} platform="web" {...n} />
                ))}
              </NotificationList>
              <p className="figure text-[11px] uppercase tracking-[0.14em] text-[#A08E84]">web · read</p>
              <NotificationList platform="web" heading={TODAY}>
                {NOTES.map((n) => (
                  <NotificationRow key={n.title} platform="web" state="read" {...n} />
                ))}
              </NotificationList>
            </div>
            <div className="flex flex-col gap-6 rounded-xl bg-[#161311]">
              <p className="figure text-[11px] uppercase tracking-[0.14em] text-[#A08E84]">phone · unread, then read</p>
              <div className="-mx-4 sm:mx-0">
                <NotificationList platform="phone" heading={TODAY}>
                  {NOTES.map((n, i) => (
                    <NotificationRow key={n.title} platform="phone" first={i === 0} {...n} />
                  ))}
                </NotificationList>
                <NotificationList platform="phone" heading={TODAY}>
                  {NOTES.map((n, i) => (
                    <NotificationRow key={n.title} platform="phone" first={i === 0} state="read" {...n} />
                  ))}
                </NotificationList>
              </div>
            </div>
          </div>
        </Section>
      </div>
    </main>
  );
}
