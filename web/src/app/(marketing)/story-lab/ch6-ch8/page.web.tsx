import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ALBUM } from '@/components/story/data/story';
import { NOTICES, TODAY } from '@/components/story/data/strings/common';
import { BrowserFrame, BROWSER_RADIUS, PHONE_RADIUS, PhoneFrame, Slab } from '@/components/story/frames';
import { ClientGalleryPage, type ClientGalleryState, type ClientPlayerState } from '@/components/story/mocks/client-gallery';
import { NotificationList, NotificationRow } from '@/components/story/mocks/notification-row';
import { Plate } from '@/components/story/mocks/plate';
import { ProfileTag } from '@/components/story/mocks/profile-tag';
import { RoleMarquee } from '@/components/story/mocks/role-marquee';
import { ShareDialog, type ShareDialogState } from '@/components/story/mocks/share-dialog';
import { LinkReadyAlert, ShareSheet, type ShareSheetState } from '@/components/story/mocks/share-sheet';
import { ShowcaseCard, type ShowcaseCardState } from '@/components/story/mocks/showcase-card';

/**
 * Ch6 handover, The work and Ch8: share dialog and sheet, the client page, the showcase card, the profile tag and the role marquee, every state.
 */
export const metadata: Metadata = {
  title: 'Story lab · Ch6–Ch8',
  robots: { index: false, follow: false },
};

/*
 * The lab's own motion, to prove the depth reads and moves on the compositor
 * alone: every keyframe here is transform or opacity. Phase 4 drives the same
 * parts from scroll instead of a clock. Reduced motion keeps the rest poses.
 */
const LAB_CSS = `
@keyframes m4-face { 0%,100% { transform: rotateX(6deg) rotateY(-16deg) } 42%,62% { transform: rotateX(1deg) rotateY(0deg) } }
@keyframes m4-face-m { 0%,100% { transform: rotateX(4deg) rotateY(-10deg) } 42%,62% { transform: rotateX(1deg) rotateY(0deg) } }
@keyframes m4-sheen-a { 0%,100% { opacity: .94 } 42%,62% { opacity: .5 } }
@keyframes m4-sheen-b { 0%,100% { opacity: .06 } 42%,62% { opacity: .5 } }
@keyframes m4-sharp { 0%,8% { opacity: 0 } 22%,100% { opacity: 1 } }
@keyframes m4-bar { 0%,40% { opacity: 0; transform: translateY(24px) } 50%,100% { opacity: 1; transform: none } }
@keyframes m4-sway { 0%,100% { transform: rotateX(5deg) rotateY(10deg) } 50% { transform: rotateX(3deg) rotateY(4deg) } }
@keyframes m4-sway-m { 0%,100% { transform: rotateX(4deg) rotateY(8deg) } 50% { transform: rotateX(3deg) rotateY(3deg) } }
@keyframes m4-sheet { 0%,6% { transform: translateY(100%) } 26%,100% { transform: none } }
@keyframes m4-shade { 0%,6% { opacity: 0 } 26%,100% { opacity: 1 } }
@keyframes m4-float { 0%,100% { transform: rotateX(9deg) rotateY(-10deg) translateZ(0) } 50% { transform: rotateX(5deg) rotateY(6deg) translateZ(46px) } }
@keyframes m4-float-m { 0%,100% { transform: rotateX(7deg) rotateY(-8deg) translateZ(0) } 50% { transform: rotateX(4deg) rotateY(5deg) translateZ(36px) } }
@keyframes m4-lift-shadow { 0%,100% { transform: scale(1); opacity: 1 } 50% { transform: scale(1.08); opacity: .8 } }
@keyframes m4-note { 0%,18% { opacity: 0 } 32%,100% { opacity: 1 } }
@keyframes m4-tag { 0%,38% { opacity: 0; transform: scale(.86) } 46%,100% { opacity: 1; transform: none } }
@keyframes m4-pop { 0%,4% { opacity: 0; transform: scale(.95) } 14%,100% { opacity: 1; transform: none } }
@keyframes m4-turn { 0%,100% { transform: rotateX(8deg) rotateY(14deg) } 50% { transform: rotateX(4deg) rotateY(-10deg) } }
@keyframes m4-turn-m { 0%,100% { transform: rotateX(6deg) rotateY(9deg) } 50% { transform: rotateX(3deg) rotateY(-7deg) } }
@keyframes m4-rise { 0%,30% { opacity: 0; transform: translateY(10px) } 44%,100% { opacity: 1; transform: none } }

.m4-face [data-part="slab-body"] { animation: m4-face-m 9s cubic-bezier(.65,0,.35,1) infinite }
.m4-face [data-part="slab-sheen-a"] { animation: m4-sheen-a 9s cubic-bezier(.65,0,.35,1) infinite }
.m4-face [data-part="slab-sheen-b"] { animation: m4-sheen-b 9s cubic-bezier(.65,0,.35,1) infinite }
.m4-face [data-part="tile-sharp"] { animation: m4-sharp 9s cubic-bezier(.16,1,.3,1) infinite }
.m4-face [data-part="tile"]:nth-child(2) [data-part="tile-sharp"] { animation-delay: .06s }
.m4-face [data-part="tile"]:nth-child(3) [data-part="tile-sharp"] { animation-delay: .12s }
.m4-face [data-part="tile"]:nth-child(4) [data-part="tile-sharp"] { animation-delay: .18s }
.m4-face [data-part="tile"]:nth-child(5) [data-part="tile-sharp"] { animation-delay: .24s }
.m4-face [data-part="tile"]:nth-child(6) [data-part="tile-sharp"] { animation-delay: .30s }
.m4-face [data-part="tile"]:nth-child(n+7) [data-part="tile-sharp"] { animation-delay: .36s }
.m4-face [data-part="picks-bar"] { animation: m4-bar 9s cubic-bezier(.16,1,.3,1) infinite }
.m4-sheet [data-part="slab-body"] { animation: m4-sway-m 9s cubic-bezier(.65,0,.35,1) infinite }
.m4-sheet [data-part="sheet"] { animation: m4-sheet 9s cubic-bezier(.32,.72,0,1) infinite }
.m4-sheet [data-part="sheet-shade"] { animation: m4-shade 9s cubic-bezier(.32,.72,0,1) infinite }
.m4-card [data-part="slab-body"] { animation: m4-float-m 9s cubic-bezier(.65,0,.35,1) infinite }
.m4-card [data-part="slab-shadow"] { animation: m4-lift-shadow 9s cubic-bezier(.65,0,.35,1) infinite }
.m4-card [data-part="craft-note"] { animation: m4-note 9s cubic-bezier(.16,1,.3,1) infinite }
.m4-card [data-part="craft-tag"] { animation: m4-tag 9s cubic-bezier(.16,1,.3,1) infinite }
.m4-card [data-part="craft-tag"]:nth-child(2) { animation-delay: .12s }
.m4-card [data-part="craft-tag"]:nth-child(3) { animation-delay: .24s }
.m4-dialog [data-part="slab-body"] { animation: m4-turn-m 9s cubic-bezier(.65,0,.35,1) infinite }
.m4-dialog [data-part="share-dialog"] { animation: m4-pop 9s cubic-bezier(.16,1,.3,1) infinite }
.m4-dialog [data-part="link-note"] { animation: m4-rise 9s cubic-bezier(.16,1,.3,1) infinite }
@media (min-width: 768px) {
  .m4-face [data-part="slab-body"] { animation-name: m4-face }
  .m4-sheet [data-part="slab-body"] { animation-name: m4-sway }
  .m4-card [data-part="slab-body"] { animation-name: m4-float }
  .m4-dialog [data-part="slab-body"] { animation-name: m4-turn }
}
@media (prefers-reduced-motion: reduce) {
  .m4-face *, .m4-sheet *, .m4-card *, .m4-dialog * { animation: none !important }
}
`;

// ─── Lab furniture ───────────────────────────────────────────────────────

function Section({
  n,
  title,
  note,
  children,
  day = false,
}: {
  n: string;
  title: string;
  note: ReactNode;
  children: ReactNode;
  /** On the client page's paper (Ch6's day ground). */
  day?: boolean;
}) {
  return (
    <section
      className={`mt-20 first:mt-14 ${day ? '-mx-4 rounded-none bg-[#FBF7F2] px-4 py-14 text-[#1E1B18] sm:mx-0 sm:rounded-3xl sm:px-10' : ''}`}
    >
      <p className={`figure text-[11px] uppercase tracking-[0.14em] ${day ? 'text-[#7A3E1E]' : 'text-[#D18A5A]'}`}>{n}</p>
      <h2 className="mt-1.5 text-2xl font-semibold tracking-[-0.02em]">{title}</h2>
      <p className={`mt-2 max-w-[70ch] text-[14px] leading-relaxed ${day ? 'text-[#54433C]' : 'text-[#BCADA3]'}`}>{note}</p>
      <div className="mt-10">{children}</div>
    </section>
  );
}

function Specimen({
  caption,
  children,
  className = '',
  day = false,
  bleed = false,
}: {
  caption: string;
  children: ReactNode;
  className?: string;
  day?: boolean;
  /** Edge to edge below sm, as a chapter's phone figure is on a phone. */
  bleed?: boolean;
}) {
  return (
    <figure className={`flex min-w-0 flex-col items-center ${className}`}>
      <div className={bleed ? '-mx-4 flex w-[calc(100%+2rem)] justify-center sm:mx-0 sm:w-full' : 'flex w-full justify-center'}>
        {children}
      </div>
      <figcaption
        className={`figure mt-6 max-w-[40ch] text-center text-[11px] leading-relaxed ${day ? 'text-[#6F5C52]' : 'text-[#A08E84]'}`}
      >
        {caption}
      </figcaption>
    </figure>
  );
}

/** Behind the sheet and the alert: the album's grid, as the phone lays it out (3 across, 2 px gaps). Illustrative only. */
function AlbumBackdrop({ from = 0 }: { from?: number }) {
  return (
    <div className="absolute inset-0 overflow-hidden px-0 pt-2">
      <div className="grid grid-cols-3 gap-[2px]">
        {Array.from({ length: 24 }, (_, i) => (
          <Plate key={i} seed={from + i} />
        ))}
      </div>
    </div>
  );
}

/** Behind the web dialog: the album page's photos, under the dialog's overlay. Illustrative only. */
function AlbumPageBackdrop() {
  return (
    <>
      <div className="absolute inset-0 grid grid-cols-4 content-start gap-1.5 p-4 opacity-60">
        {Array.from({ length: 20 }, (_, i) => (
          <Plate key={i} seed={i + 3} className="rounded-md" />
        ))}
      </div>
      <div className="absolute inset-0 bg-black/30" />
    </>
  );
}

/**
 * A phone on a slab, in the rest pose. 375 wide by default, a real phone's
 * width in points: the phone mocks are drawn at device sizes (1 pt = 1 px),
 * so a narrower phone would crowd them as no phone does.
 */
function PhoneSlab({
  children,
  rotateY = -8,
  width = 'w-[min(100%,375px)]',
  className = '',
  time = '4:50',
  tone = 'light',
  screen = '#161311',
}: {
  children: ReactNode;
  rotateY?: number;
  width?: string;
  className?: string;
  time?: string;
  tone?: 'light' | 'dark';
  screen?: string;
}) {
  return (
    <Slab
      className={`${width} ${className}`}
      rotateY={rotateY}
      rotateX={4}
      depth={14}
      radius={PHONE_RADIUS}
      edge="device"
      shadow="floor"
    >
      <PhoneFrame width="100%" time={time} tone={tone} screen={screen} wifi>
        {children}
      </PhoneFrame>
    </Slab>
  );
}

/** The couple's phone: the client page full width, as Ch6's figure has it on a phone. */
function ClientPhone({
  state,
  caption,
  rotateY = -8,
  dark = false,
  kind,
  scroll,
  player,
  className = '',
}: {
  state: ClientGalleryState;
  caption: string;
  rotateY?: number;
  dark?: boolean;
  kind?: 'all' | 'image' | 'video' | 'audio';
  scroll?: 'top' | 'end';
  player?: ClientPlayerState;
  className?: string;
}) {
  return (
    <Specimen day={!dark} bleed caption={caption} className={className}>
      <PhoneSlab
        width="w-full max-w-[390px]"
        rotateY={rotateY}
        time={state === 'rescoped' ? '11:00' : state === 'empty' ? '10:15' : '4:52'}
        tone={dark ? 'light' : 'dark'}
        screen={dark ? '#171411' : '#FBF7F2'}
      >
        <ClientGalleryPage className="absolute inset-0" state={state} dark={dark} kind={kind} scroll={scroll} player={player} browserBar />
      </PhoneSlab>
    </Specimen>
  );
}

const DIALOG_STATES: { state: ShareDialogState; caption: string }[] = [
  { state: 'fresh', caption: 'fresh · no link yet, the default: all three ticked' },
  { state: 'scoped', caption: 'scoped · Photos only → Generate link' },
  { state: 'generated', caption: 'generated · the link, the note, Revoke · “Link is up to date”' },
  { state: 'rescoped', caption: 'rescoped · Day 21: Videos and Audio ticked → Update link' },
  { state: 'updated', caption: 'updated · the same link, all three (default)' },
];

const SHEET_STATES: { state: ShareSheetState; caption: string }[] = [
  { state: 'fresh', caption: 'fresh · Sun 4:50 PM · no link yet, all ticked' },
  { state: 'scoped', caption: 'scoped · Photos 412 only → Make link' },
  { state: 'making', caption: 'making · “Making the link…”' },
  { state: 'reopened', caption: 'reopened · Day 21 · what the link shows: Photos' },
  { state: 'rescoped', caption: 'rescoped · Films 8 and Audio 2 ticked (default)' },
];

const CARD_STATES: { state: ShowcaseCardState; caption: string }[] = [
  { state: 'posted', caption: 'posted · risen; the note masked, tags off' },
  { state: 'noted', caption: 'noted · HOW IT WAS MADE revealed' },
  { state: 'tagged', caption: 'tagged · the craft tags ticked on (default)' },
];

// ─── The page ────────────────────────────────────────────────────────────

export default function Ch6Ch8Lab() {
  if (process.env.NODE_ENV === 'production') notFound();

  return (
    <main className="min-h-dvh overflow-x-clip bg-[#161311] px-4 pb-32 pt-12 text-[#F2EDE8] sm:px-8">
      <style>{LAB_CSS}</style>
      <div className="mx-auto max-w-[1320px]">
        <a href="/story-lab" className="figure text-[11px] uppercase tracking-[0.14em] text-[#A08E84] hover:text-[#F2EDE8]">
          ← Story lab
        </a>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.03em]">Ch6–Ch8 · the handover, the work, zoom out</h1>
        <p className="mt-3 max-w-[64ch] text-[15px] leading-relaxed text-[#BCADA3]">
          The owner&rsquo;s Client link dialog and sheet, the couple&rsquo;s delivery page, the picks notice, the
          showcase card, Bea&rsquo;s profile tag and the role marquee, every key frame, each on a slab in its rest
          pose. Check at 375 and 1440: below 768 the phones lose their bezel and the tilts stay under 10°.
        </p>

        {/* ── 01 · The web dialog ── */}
        <Section
          n="01 · Ch6 · web"
          title="ShareDialog: the Client link dialog"
          note="share-dialog.tsx in web dark: checkboxes (primary #D18A5A, tick #161311), the read-only Link field (mono, 12 px below 768 and 14 px from it, as the Input's classes merge; it clips like an input), the ShieldAlert note, and the action Button (#A85D35, white). A static card: every state is the same markup with different data attributes, so a stage ticks a box or flips the button without re-rendering."
        >
          <div className="grid gap-x-10 gap-y-16 lg:grid-cols-2 2xl:grid-cols-3">
            {DIALOG_STATES.map(({ state, caption }, i) => (
              <Specimen key={state} caption={caption}>
                <Slab
                  className="w-full max-w-[460px]"
                  rotateX={5}
                  rotateY={i % 2 ? 7 : -7}
                  depth={10}
                  radius={BROWSER_RADIUS}
                  edge="card"
                >
                  <BrowserFrame url="web.virgo.ph/albums/8c1f…" viewportClassName="h-[640px] overflow-hidden sm:h-[540px]">
                    <AlbumPageBackdrop />
                    <div className="absolute inset-0 flex items-center justify-center p-3 sm:p-4">
                      <ShareDialog state={state} />
                    </div>
                  </BrowserFrame>
                </Slab>
              </Specimen>
            ))}
          </div>
        </Section>

        {/* ── 02 · The phone sheet ── */}
        <Section
          n="02 · Ch6 · phone"
          title="ShareSheet and LinkReadyAlert"
          note="The album screen's Client link sheet at device sizes (NativeWind renders rem at 14 pt, so text-sm is 12.25 px and px-4 is 14): the BottomSheet's shade (#161311 at 72%), 21 px corners and handle; rows ticked in primary/10 with a round #A85D35 box (the app's rounded-md is 14 pt on a 22 px box). Counts are the album's own: 2 films on Sunday, 8 three weeks later. The alert is the OS's, drawn neutral, with the same URL both times."
        >
          <div className="grid gap-x-8 gap-y-16 md:grid-cols-2 xl:grid-cols-3">
            {SHEET_STATES.map(({ state, caption }, i) => (
              <Specimen key={state} bleed caption={caption}>
                <PhoneSlab rotateY={i % 2 ? 8 : -8} time={state === 'reopened' || state === 'rescoped' ? '10:58' : '4:50'}>
                  <AlbumBackdrop from={i * 3} />
                  <ShareSheet state={state} />
                </PhoneSlab>
              </Specimen>
            ))}
            <Specimen bleed caption="LinkReadyAlert · Sun 4:50 PM · Copy link · Share… · Done">
              <PhoneSlab rotateY={-8} time="4:50">
                <AlbumBackdrop from={2} />
                <LinkReadyAlert />
              </PhoneSlab>
            </Specimen>
            <Specimen bleed caption="LinkReadyAlert · Day 21 · the same URL">
              <PhoneSlab rotateY={8} time="11:00">
                <AlbumBackdrop from={5} />
                <LinkReadyAlert />
              </PhoneSlab>
            </Specimen>
          </div>
        </Section>

        {/* ── 03 · The client page ── */}
        <Section
          day
          n="03 · Ch6 · the couple's phone"
          title="ClientGalleryPage: the delivery page"
          note={
            <>
              client-gallery.template.ts as React, in its own palette: paper #FBF7F2, the dark hero panel, system type,
              a serif H1, mono counts. Kind tabs only once the link shows more than one kind; hearts on every tile;
              the picks bar at 520 px and under shows Download as its icon. No day headings (they count only what
              has loaded), and the &ldquo;Sent.&rdquo; sentence is screen-reader text, never drawn. A film plays in
              the page&rsquo;s own full-screen player, never in its tile. Recordings carry no capture time, so each is
              headed by the day it was uploaded. The address bar and the video controls are generic browser chrome.
            </>
          }
        >
          <div className="grid gap-x-12 gap-y-16 lg:grid-cols-2 2xl:grid-cols-3">
            <ClientPhone state="previews" caption="previews · just opened: blurred Plates, hearts on every tile" />
            <ClientPhone state="opened" rotateY={8} caption="opened · sharpened · no kind tabs: photos only (412 · 5.6 GB)" />
            <ClientPhone state="picked" caption="picked · 12 picked · Send to photographer" />
            <ClientPhone state="sent" rotateY={8} caption="sent · Send again (the note hides at 520 px)" />
            <ClientPhone state="rescoped" caption="rescoped · Day 21 · All 422 · Photos 412 · Films 8 · Audio 2 · dock" />
            <ClientPhone state="rescoped" scroll="end" rotateY={8} caption="rescoped · scrolled to the end: films, Recordings · 2 files" />
            <ClientPhone
              state="rescoped"
              kind="video"
              caption="rescoped · Films tab: the same-day edit first (Ch5's FilmTile, poster), the teaser, Ernie's six"
            />
            <ClientPhone
              state="rescoped"
              kind="video"
              player="poster"
              rotateY={8}
              caption="player · a tapped film opens the page's own full-screen player (#videoViewer); the controls are the browser's, drawn generic"
            />
            <ClientPhone state="rescoped" kind="video" player="playing" caption="player · playing: the second frame, 1:36 of 3:48 (it never plays inside its tile)" />
            <ClientPhone state="rescoped" kind="audio" rotateY={8} caption="rescoped · Audio tab: Recordings, “Vows” playing 0:42 / 3:12" />
            <ClientPhone state="empty" caption="empty · Ch7, after Day 112: Nothing has been shared here yet." />
            <ClientPhone state="sent" dark rotateY={8} caption="dark · the page follows the device; the hero stays the dark panel" />
          </div>

          {/* Desktop only: on a phone it would not be wide. */}
          <div className="mt-20 hidden lg:block">
            <Specimen day caption="wide · the same mock at desktop width: 4 columns, Download with its label, the “Sent Dec 13” note">
              <Slab className="w-full max-w-[1160px]" rotateX={5} rotateY={0} depth={10} radius={BROWSER_RADIUS} edge="card">
                <BrowserFrame url={ALBUM.linkPath} viewportClassName="h-[660px]">
                  <ClientGalleryPage className="absolute inset-0" state="rescoped" />
                </BrowserFrame>
              </Slab>
            </Specimen>
          </div>
        </Section>

        {/* ── 04 · The picks notice ── */}
        <Section
          n="04 · Ch6"
          title="Mika's notice: the client sent their picks"
          note="NotificationRow with NOTICES.picks: the API's own title and body, “12 files chosen from “Reyes & Santos — Wedding”.”, at 8:15 PM on Sunday. Albums tint chart-3 on the web and the brand accent on the phone."
        >
          <div className="grid items-start gap-10 lg:grid-cols-2">
            <Slab className="w-full" rotateX={6} rotateY={-6} depth={8} radius="rounded-xl" edge="card">
              <NotificationList platform="web" heading={TODAY}>
                <NotificationRow platform="web" {...NOTICES.picks} />
              </NotificationList>
            </Slab>
            <div className="-mx-4 sm:mx-0">
              <NotificationList platform="phone" heading={TODAY}>
                <NotificationRow platform="phone" first {...NOTICES.picks} />
              </NotificationList>
            </div>
          </div>
        </Section>

        {/* ── 05 · The work ── */}
        <Section
          n="05 · The work"
          title="ShowcaseCard: a post in the phone feed"
          note="The feed's Placard at device sizes (rem at 14 pt): a full-width Plate cover 1.15× as tall as wide, the placard lifted 28 px over its foot, the byline with Hire, HOW IT WAS MADE with the note and three craft tags, and Like · See it all · Keep. Title, note and tags are the compose form's own placeholder and suggestions. Phones are 375 wide, a real phone's points."
        >
          <div className="grid gap-x-10 gap-y-16 md:grid-cols-2 xl:grid-cols-3">
            {CARD_STATES.map(({ state, caption }, i) => (
              <Specimen key={state} bleed caption={caption}>
                <PhoneSlab rotateY={i === 0 ? -8 : i === 1 ? 0 : 8} time="7:12">
                  <div className="absolute inset-0 flex flex-col justify-end overflow-hidden pb-5">
                    <ShowcaseCard state={state} />
                  </div>
                </PhoneSlab>
              </Specimen>
            ))}
            <Specimen caption="on its own · as the story floats it, a card slab · a post of four pieces">
              <Slab className="w-full max-w-[375px]" rotateX={5} rotateY={-8} depth={8} radius="rounded-[22px]" edge="card">
                <ShowcaseCard seed={151} pieces={4} />
              </Slab>
            </Specimen>
          </div>
        </Section>

        {/* ── 06 · Ch8 ── */}
        <Section
          n="06 · Ch8"
          title="ProfileTag and RoleMarquee"
          note="The tag beside Bea's star: the web profile's muted fallback avatar, “Bea · HMUA · Cebu City”, and profileStatsLine({ connections: 3, jobsDone: 1 }) from the app. On the §1.5 scrim (#161311 at 0.94). The marquee is static here; Phase 4 drives each row by scroll. Reduced motion gets the chips."
        >
          <div className="relative overflow-hidden rounded-3xl border border-[#2A2522] bg-[radial-gradient(120%_90%_at_30%_20%,#231c17_0%,#161311_55%,#0f0c0a_100%)] px-4 py-14 sm:px-10">
            {/* A few stand-in stars, for the tag to sit among. */}
            {[
              [12, 18, 2],
              [28, 62, 1.5],
              [46, 30, 2.5],
              [64, 74, 1.5],
              [78, 22, 2],
              [88, 58, 1.5],
            ].map(([x, y, r]) => (
              <span
                key={`${x}-${y}`}
                aria-hidden
                className="absolute rounded-full bg-[#F7E7CF]"
                style={{ left: `${x}%`, top: `${y}%`, width: r * 2, height: r * 2, boxShadow: '0 0 10px 2px rgba(247,231,207,0.35)' }}
              />
            ))}
            <div className="relative grid gap-12 md:grid-cols-2">
              <Specimen caption="shown · with the leader toward the star (default has none)">
                <div className="flex items-center gap-0 pl-8">
                  <span aria-hidden className="mr-5 size-[7px] rounded-full bg-[#F7E7CF] shadow-[0_0_14px_4px_rgba(247,231,207,0.45)]" />
                  <ProfileTag leader />
                </div>
              </Specimen>
              <Specimen caption="hidden · before the zoom ends: faded, 10 px low (outline shows its box)">
                <div className="rounded-[18px] outline outline-1 outline-dashed outline-[#362F2B]">
                  <ProfileTag state="hidden" />
                </div>
              </Specimen>
            </div>
            <div className="relative mt-14 -mx-4 sm:-mx-10">
              <p className="figure mb-4 px-4 text-center text-[11px] uppercase tracking-[0.14em] text-[#A08E84] sm:px-10">
                RoleMarquee · one row on phones, two from 768 (row b starts half along)
              </p>
              <RoleMarquee />
            </div>
            <div className="relative mt-12">
              <p className="figure mb-4 text-center text-[11px] uppercase tracking-[0.14em] text-[#A08E84]">
                variant chips · reduced motion
              </p>
              <RoleMarquee variant="chips" className="justify-center" />
            </div>
          </div>
        </Section>

        {/* ── 07 · Depth ── */}
        <Section
          n="07 · §1.13 depth"
          title="Depth in motion"
          note="A gentle loop to prove the depth reads: the couple's phone turns to face you while its previews sharpen and the picks bar rises; the sheet rises over the album; the card lifts on z with its shadow while the note reveals and the tags tick on; the dialog turns as it opens. Transform and opacity only, ±18° on desktop and ±10° below 768. Reduced motion holds the rest poses."
        >
          <div className="grid items-center gap-x-16 gap-y-20 md:grid-cols-2">
            <Specimen caption="couple's phone · turns to face you · previews sharpen · picks bar rises">
              <div className="flex w-full justify-center">
                <Slab
                  className="m4-face w-[min(100%,375px)]"
                  rotateY={-10}
                  rotateX={4}
                  depth={14}
                  radius={PHONE_RADIUS}
                  edge="device"
                  shadow="floor"
                >
                  <PhoneFrame width="100%" time="4:52" tone="dark" screen="#FBF7F2" wifi>
                    <ClientGalleryPage className="absolute inset-0" state="sent" tiles={6} browserBar />
                  </PhoneFrame>
                </Slab>
              </div>
            </Specimen>
            <Specimen caption="owner's phone · the sheet rises over the album">
              <Slab
                className="m4-sheet w-[min(100%,375px)]"
                rotateY={8}
                rotateX={4}
                depth={14}
                radius={PHONE_RADIUS}
                edge="device"
                shadow="floor"
              >
                <PhoneFrame width="100%" time="10:58" wifi>
                  <AlbumBackdrop from={9} />
                  <ShareSheet state="rescoped" />
                </PhoneFrame>
              </Slab>
            </Specimen>
            <Specimen caption="showcase card · lifts on z · note reveals · tags tick on">
              <Slab className="m4-card w-full max-w-[375px]" rotateX={7} rotateY={-8} depth={8} radius="rounded-[22px]" edge="card">
                <ShowcaseCard />
              </Slab>
            </Specimen>
            <Specimen caption="dialog · turns as it opens · the note rises">
              <Slab className="m4-dialog w-full max-w-[384px]" rotateX={6} rotateY={9} depth={8} radius="rounded-[16.8px]" edge="card">
                <ShareDialog state="generated" />
              </Slab>
            </Specimen>
          </div>
        </Section>
      </div>
    </main>
  );
}
