import type { CSSProperties, ReactNode } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ALBUM, TZ, WEDDING_DAY } from '@/components/story/data/story';
import { TODAY } from '@/components/story/data/strings/common';
import { FRAME_URLS, TILE_SETS, ALBUM_TILES, type SectionKey } from '@/components/story/data/strings/ch5';
import { CLEANUPS, CLIENT_EMPTY, READ } from '@/components/story/data/strings/ch7';
import { BrowserFrame, BROWSER_RADIUS, Perspective, PHONE_RADIUS, PhoneFrame, Slab } from '@/components/story/frames';
import { ActivityFeed, type ActivityFeedState } from '@/components/story/mocks/activity-feed';
import { AlbumCard, type AlbumCardState } from '@/components/story/mocks/album-card';
import { ClientGalleryPage } from '@/components/story/mocks/client-gallery';
import { AlbumGrid, type AlbumGridState } from '@/components/story/mocks/album-grid';
import { AlbumHeader, type AlbumHeaderState } from '@/components/story/mocks/album-header';
import { DayHeading } from '@/components/story/mocks/day-heading';
import { DayRuler, type DayRulerState } from '@/components/story/mocks/day-ruler';
import { DeviceChip, type DeviceChipState } from '@/components/story/mocks/device-chip';
import { FilmTile, type FilmTileState } from '@/components/story/mocks/film-tile';
import { NotificationList, NotificationRow } from '@/components/story/mocks/notification-row';
import { Plate } from '@/components/story/mocks/plate';
import { RetentionField, type RetentionFieldState } from '@/components/story/mocks/retention-field';
import { SectionChips, type SectionChipsState } from '@/components/story/mocks/section-chips';
import { StorageMeter, type StorageMeterState } from '@/components/story/mocks/storage-meter';
import { Viewfinder, type ViewfinderState } from '@/components/story/mocks/viewfinder';

/**
 * Saturday's album, the crew's uploads, the meter and the viewfinder (Ch5); the retention setting, the day ruler and the emptied album (Ch7).
 */
export const metadata: Metadata = {
  title: 'Story lab · Ch5–Ch7',
  robots: { index: false, follow: false },
};

/**
 * The lab's own motion, to prove the depth on the compositor alone
 * (transform and opacity only). Phase 4 drives the same parts from scroll.
 *
 * - `lab57-fan`: Saturday's frames gather into one stack, then fan back in
 *   depth into capture order, Prep nearest, Reception furthest (§1.13 Ch5),
 *   staggered 60 ms a tile.
 * - `lab57-bob`: the device chips float at their own depths.
 * - `lab57-turn` / `lab57-lift`: a slab turning (±10° on phones, ±16° from
 *   768) with its sheens crossfading, and a card lifting on its shadow.
 * - `lab57-scroll`: the same fan, scroll-linked through `animation-timeline:
 *   view()` where the browser has it; elsewhere the fanned rest pose.
 * Reduced motion keeps every pose and drops the movement.
 */
const LAB_CSS = `
@keyframes lab57-fan { 0%, 10% { transform: var(--fan) } 38%, 58% { transform: var(--stack) } 88%, 100% { transform: var(--fan) } }
@keyframes lab57-glow { 0%, 10% { opacity: 0 } 38%, 58% { opacity: .9 } 88%, 100% { opacity: 0 } }
@keyframes lab57-bob { 0%, 100% { transform: var(--rest) } 50% { transform: var(--rest) translate3d(0, -9px, 0) } }
@keyframes lab57-turn { 0%, 100% { transform: rotateX(5deg) rotateY(-10deg) } 50% { transform: rotateX(5deg) rotateY(10deg) } }
@keyframes lab57-turn-d { 0%, 100% { transform: rotateX(6deg) rotateY(-16deg) } 50% { transform: rotateX(6deg) rotateY(16deg) } }
@keyframes lab57-sheen-a { 0%, 100% { opacity: 1 } 50% { opacity: 0 } }
@keyframes lab57-sheen-b { 0%, 100% { opacity: 0 } 50% { opacity: 1 } }
@keyframes lab57-lift { 0%, 100% { transform: rotateX(12deg) rotateY(8deg) translateZ(0) } 50% { transform: rotateX(12deg) rotateY(8deg) translateZ(56px) } }
@keyframes lab57-lift-shadow { 0%, 100% { transform: scale(1); opacity: 1 } 50% { transform: scale(1.09); opacity: .72 } }
@keyframes lab57-scroll-fan { from { transform: var(--stack) } to { transform: var(--fan) } }
.lab57-fan > [data-tile] { transform: var(--fan); animation: lab57-fan 9s cubic-bezier(.65,0,.35,1) infinite; animation-delay: var(--delay) }
.lab57-fan > [data-glow] { animation: lab57-glow 9s cubic-bezier(.65,0,.35,1) infinite }
.lab57-fan > [data-chip] { transform: var(--rest); animation: lab57-bob 6s cubic-bezier(.65,0,.35,1) infinite; animation-delay: var(--delay) }
.lab57-turn [data-part="slab-body"] { animation: lab57-turn 10s cubic-bezier(.65,0,.35,1) infinite }
.lab57-turn [data-part="slab-sheen-a"] { animation: lab57-sheen-a 10s cubic-bezier(.65,0,.35,1) infinite }
.lab57-turn [data-part="slab-sheen-b"] { animation: lab57-sheen-b 10s cubic-bezier(.65,0,.35,1) infinite }
.lab57-lift [data-part="slab-body"] { animation: lab57-lift 7s cubic-bezier(.65,0,.35,1) infinite }
.lab57-lift [data-part="slab-shadow"] { animation: lab57-lift-shadow 7s cubic-bezier(.65,0,.35,1) infinite }
.lab57-scroll > [data-tile] { transform: var(--fan) }
@supports (animation-timeline: view()) {
  .lab57-scroll > [data-tile] { animation: lab57-scroll-fan linear both; animation-timeline: view(); animation-range: entry 15% cover 55% }
}
@media (min-width: 768px) { .lab57-turn [data-part="slab-body"] { animation-name: lab57-turn-d } }
@media (prefers-reduced-motion: reduce) {
  .lab57-fan > *, .lab57-turn *, .lab57-lift *, .lab57-scroll > * { animation: none !important }
}
`;

/**
 * Saturday 11:55 PM, just after Mika's last upload: a `now` true to one
 * moment (the day reads "Today"), against Ch5's default Monday morning.
 */
const SAT_NIGHT = `${WEDDING_DAY}T23:55:00${TZ}`;

/** The golden ground of Ch5, as pre-baked stops (§1.4). */
const GOLD = 'linear-gradient(180deg, #F7E7CF 0%, #F0C88E 38%, #E8A86E 72%, #D98A55 100%)';

/** A stand-in for the golden-hour stage the viewfinder frames: the ground, and the low sun (#FFE7C2). */
const STAGE = `radial-gradient(22% 30% at 64% 58%, #FFE7C2 0%, rgba(255,231,194,0.55) 38%, rgba(255,231,194,0) 100%), ${GOLD}`;

function Section({ n, title, note, children }: { n: string; title: string; note: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-24 first:mt-14">
      <p className="figure text-[11px] uppercase tracking-[0.14em] text-[#D18A5A]">{n}</p>
      <h2 className="mt-1.5 text-2xl font-semibold tracking-[-0.02em]">{title}</h2>
      <p className="mt-2 max-w-[70ch] text-[14px] leading-relaxed text-[#BCADA3]">{note}</p>
      <div className="mt-10">{children}</div>
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
  /** On a light ground: the light-ground muted ink (§1.5). */
  day?: boolean;
}) {
  return (
    <figure className={`flex min-w-0 flex-col items-center ${className}`}>
      <div className="flex w-full justify-center">{children}</div>
      {/* Clear of a tilted slab's near edge and its contact shadow. */}
      <figcaption className={`figure mt-8 text-center text-[11px] leading-relaxed ${day ? 'text-[#6F5C52]' : 'text-[#A08E84]'}`}>
        {caption}
      </figcaption>
    </figure>
  );
}

/** A state's name, above its specimen inside a frame. */
function StateTag({ children, day = false }: { children: ReactNode; day?: boolean }) {
  return (
    <p className={`figure px-4 pb-2 pt-4 text-[11px] uppercase tracking-[0.14em] ${day ? 'text-[#6F5C52]' : 'text-[#A08E84]'}`}>
      {children}
    </p>
  );
}

/** A chip state names the section the grid is narrowed to; the others show everything. */
const sectionOf = (chips: SectionChipsState): SectionKey =>
  chips === 'prep' || chips === 'ceremony' || chips === 'reception' ? chips : 'all';

/** The web album page around the mocks: header, then rail and grid at 64rem of frame, chips and grid below it. */
function WebAlbumPage({
  header = 'draft',
  chips = 'all',
  grid = 'sorted',
}: {
  header?: AlbumHeaderState;
  chips?: SectionChipsState;
  grid?: AlbumGridState;
}) {
  return (
    <>
      <AlbumHeader platform="web" state={header} />
      <div className="@container">
        <div className="px-4 pb-8 pt-5 @[40rem]:px-6 @[64rem]:grid @[64rem]:grid-cols-[14.5rem_minmax(0,1fr)] @[64rem]:gap-8 @[64rem]:px-8 @[64rem]:pt-6">
          <div className="hidden @[64rem]:block">
            <SectionChips platform="web" layout="rail" state={chips} />
          </div>
          <div className="min-w-0">
            <SectionChips platform="web" layout="chips" state={chips} className="mb-3 @[64rem]:hidden" />
            <AlbumGrid platform="web" count={12} state={grid} section={sectionOf(chips)} />
          </div>
        </div>
      </div>
    </>
  );
}

/** The phone album screen around the mocks. */
function PhoneAlbumScreen({
  header,
  chips,
  grid,
  now,
}: {
  header: AlbumHeaderState;
  chips: SectionChipsState;
  grid: AlbumGridState;
  /** When it is looked at; Ch5's Monday morning unless given. */
  now?: string;
}) {
  return (
    <div className="flex h-full flex-col">
      <AlbumHeader platform="phone" state={header} />
      <SectionChips platform="phone" state={chips} />
      <AlbumGrid platform="phone" count={9} state={grid} section={sectionOf(chips)} now={now} />
    </div>
  );
}

function PhoneSlab({
  children,
  rotateY = -10,
  time = '9:00',
  ratio,
  className = 'w-[min(100%,390px)]',
  tone = 'light',
  screen,
}: {
  children: ReactNode;
  rotateY?: number;
  time?: string;
  ratio?: number;
  className?: string;
  tone?: 'light' | 'dark';
  screen?: string;
}) {
  return (
    <Slab className={className} rotateY={rotateY} rotateX={4} depth={14} radius={PHONE_RADIUS} edge="device" shadow="floor">
      <PhoneFrame width="100%" time={time} ratio={ratio} tone={tone} screen={screen}>
        {children}
      </PhoneFrame>
    </Slab>
  );
}

function BrowserSlab({
  url,
  children,
  rotateX = 5,
  rotateY = 0,
  className = 'w-full',
  viewportClassName = '',
}: {
  url: string;
  children: ReactNode;
  rotateX?: number;
  rotateY?: number;
  className?: string;
  viewportClassName?: string;
}) {
  return (
    <Slab className={className} rotateX={rotateX} rotateY={rotateY} depth={10} radius={BROWSER_RADIUS} edge="card">
      <BrowserFrame url={url} viewportClassName={viewportClassName}>
        {children}
      </BrowserFrame>
    </Slab>
  );
}

const HEADER_STATES: AlbumHeaderState[] = ['empty', 'draft', 'delivered', 'cleared'];
const CHIP_STATES: SectionChipsState[] = ['empty', 'none', 'all', 'prep', 'ceremony', 'reception'];
const GRID_STATES: { state: AlbumGridState; note: string }[] = [
  { state: 'empty', note: 'empty · the app’s own empty album' },
  { state: 'arriving', note: 'arriving · upload order, each stamped' },
  { state: 'sorted', note: 'sorted · rest · capture order' },
];
const SECTION_FILTERS: Exclude<SectionKey, 'all'>[] = ['prep', 'ceremony', 'reception'];
const FILM_STATES: FilmTileState[] = ['poster', 'pulse', 'playing'];
const DEVICE_STATES: DeviceChipState[] = ['idle', 'sending', 'sent'];
const FEED_STATES: ActivityFeedState[] = ['empty', 'first', 'second', 'all'];
const METER_STATES: { state: StorageMeterState; note: string }[] = [
  { state: 'baseline', note: 'baseline · before Saturday' },
  { state: 'saturday', note: 'saturday · rest · Ch5' },
  { state: 'beforeCleanUp', note: 'beforeCleanUp · Day 21 to 91' },
  { state: 'day91', note: 'day91' },
  { state: 'day92', note: 'day92' },
  { state: 'day112', note: 'day112 · Ch7 end' },
];
const VF_STATES: ViewfinderState[] = ['off', 'marks', 'readout'];
const RETENTION_STATES: RetentionFieldState[] = ['until', 'open', 'chosen'];
const RULER_STATES: DayRulerState[] = ['start', 'day91', 'day92', 'day112'];
const CARD_STATES: AlbumCardState[] = ['draft', 'delivered', 'empty'];

/** The fan: nine of Saturday's frames, nearest first. */
const FAN = TILE_SETS[9].map((i) => ALBUM_TILES[i]);

function FanScene({ scroll = false }: { scroll?: boolean }) {
  return (
    <div>
      <Perspective
        className={`${scroll ? 'lab57-scroll' : 'lab57-fan'} relative mx-auto h-[320px] w-full max-w-[1040px] [--cx:54%] [--sx:24px] [--sy:9px] [--sz:40px] [--z0:30px] sm:h-[400px] md:[--cx:66%] md:[--sx:80px] md:[--sy:13px] md:[--sz:70px] md:[--z0:150px]`}
        origin="45% 30%"
      >
        {!scroll && (
          <div
            data-glow
            aria-hidden
            className="pointer-events-none absolute top-1/2 size-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0"
            style={{ left: 'var(--cx)', background: 'radial-gradient(closest-side, rgba(240,200,142,0.34), rgba(240,200,142,0))' }}
          />
        )}
        {FAN.map((tile, i) => {
          const spread = i - (FAN.length - 1) / 2;
          const jitter = (i % 3) - 1;
          const style = {
            left: 'var(--cx)',
            // Gathered: one loose pile at the centre, a hair of depth apiece.
            '--stack': `translate3d(calc(-50% + ${jitter * 4}px), calc(-50% - ${i * 1.5}px), ${i * 2}px) rotateZ(${jitter * 2.5}deg)`,
            // Fanned: capture order receding into depth, Prep nearest, rising as it goes.
            '--fan': `translate3d(calc(-50% + ${spread} * var(--sx)), calc(-50% + ${-spread} * var(--sy)), calc(${-i} * var(--sz) + var(--z0))) rotateY(-22deg) rotateX(4deg)`,
            '--delay': `${i * 60}ms`,
            zIndex: FAN.length - i,
          } as CSSProperties;
          return (
            <div key={tile.index} data-tile className="absolute top-1/2 w-[84px] sm:w-[112px] md:w-[128px]" style={style}>
              <div className="overflow-hidden rounded-[10px] shadow-[0_22px_44px_-20px_rgba(0,0,0,0.95)] ring-1 ring-[rgba(255,255,255,0.09)]">
                {tile.kind === 'video' ? <FilmTile look="web" aspect="1:1" /> : <Plate seed={tile.seed} aspect="1:1" />}
              </div>
            </div>
          );
        })}
        {!scroll &&
          (['mika', 'ernie', 'kenn'] as const).map((who, i) => (
            <div
              key={who}
              data-chip
              className="absolute left-0 top-[8%] hidden md:block"
              style={
                {
                  '--rest': `translate3d(0, ${i * 84}px, ${70 - i * 35}px)`,
                  '--delay': `${i * 0.45}s`,
                } as CSSProperties
              }
            >
              <DeviceChip who={who} />
            </div>
          ))}
      </Perspective>
      <div className="figure mx-auto mt-2 flex max-w-[640px] items-center justify-between gap-4 px-4 text-[11px] uppercase tracking-[0.14em] text-[#A08E84] md:ml-auto md:mr-[8%]">
        <span>
          {FAN[0].section} · {FAN[0].takenAt.slice(11, 16)}
        </span>
        <span aria-hidden className="h-px flex-1 bg-[linear-gradient(90deg,rgba(240,200,142,0.5),rgba(240,200,142,0.05))]" />
        <span>
          {FAN[FAN.length - 1].section} · {FAN[FAN.length - 1].takenAt.slice(11, 16)}
        </span>
      </div>
    </div>
  );
}

export default function Ch5Ch7Lab() {
  if (process.env.NODE_ENV === 'production') notFound();

  return (
    <main className="min-h-dvh overflow-x-clip bg-[#161311] px-4 pb-40 pt-12 text-[#F2EDE8] sm:px-8">
      <style>{LAB_CSS}</style>
      <div className="mx-auto max-w-[1240px]">
        <a href="/story-lab" className="figure text-[11px] uppercase tracking-[0.14em] text-[#A08E84] hover:text-[#F2EDE8]">
          ← Story lab
        </a>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.03em]">Ch5 · Saturday — Ch7 · Forget</h1>
        <p className="mt-3 max-w-[64ch] text-[15px] leading-relaxed text-[#BCADA3]">
          The album the crew fills on Saturday night, the feed that says who sent what, the one meter it all counts
          against, and the setting that empties it again ninety days later. Every mock in every state, inside its
          frame, at its 3D rest pose. Check at 375 and 1440: frames lay out by their own width, so the web album
          swaps its rail for chips and crops its grid to whole rows.
        </p>

        {/* ─── Ch5 ─────────────────────────────────────────────────────── */}

        <Section
          n="01 · Ch5 · B10"
          title="Album page, web"
          note={
            <>
              AlbumHeader, SectionChips (rail from 64rem of frame, chips below) and AlbumGrid with its DayHeading, as{' '}
              <span className="figure text-[12px]">albums/[id]</span> draws them. The day heading is the app’s own{' '}
              <span className="figure text-[12px]">dayTitle</span> and <span className="figure text-[12px]">daySpan</span>{' '}
              with Monday morning’s fixed now.
            </>
          }
        >
          <Specimen caption="rest · draft · Monday’s sections · capture order · crops to ≤ 3 whole rows">
            <BrowserSlab url={FRAME_URLS.album} rotateX={5} rotateY={-3} className="w-full max-w-[1120px]">
              <WebAlbumPage />
            </BrowserSlab>
          </Specimen>

          <div className="mt-20 grid gap-x-8 gap-y-14 lg:grid-cols-3">
            {GRID_STATES.map(({ state, note }, i) => (
              <Specimen key={state} caption={`AlbumGrid · ${note}`}>
                <BrowserSlab url={FRAME_URLS.album} rotateY={(i - 1) * 6} viewportClassName="p-4">
                  <AlbumGrid platform="web" count={9} state={state} />
                </BrowserSlab>
              </Specimen>
            ))}
          </div>

          <div className="mt-20 grid gap-x-8 gap-y-14 lg:grid-cols-3">
            {SECTION_FILTERS.map((section, i) => (
              <Specimen key={section} caption={`a chip is a filter · ${section} · the grid and its heading narrow to it`}>
                <BrowserSlab url={FRAME_URLS.album} rotateY={(i - 1) * 6} viewportClassName="p-4">
                  <SectionChips platform="web" layout="chips" state={section} className="mb-3" />
                  <AlbumGrid platform="web" count={12} section={section} />
                </BrowserSlab>
              </Specimen>
            ))}
          </div>

          <div className="mt-20 grid gap-x-8 gap-y-14 lg:grid-cols-2">
            <Specimen caption="AlbumHeader · web · empty · draft · delivered · cleared">
              <BrowserSlab url={FRAME_URLS.album} rotateY={-4}>
                {HEADER_STATES.map((s) => (
                  <div key={s}>
                    <StateTag>{s}</StateTag>
                    <AlbumHeader platform="web" state={s} />
                  </div>
                ))}
              </BrowserSlab>
            </Specimen>
            <Specimen caption="SectionChips · web chips · empty · none · all · prep · ceremony · reception">
              <BrowserSlab url={FRAME_URLS.album} rotateY={4} viewportClassName="pb-4">
                {CHIP_STATES.map((s) => (
                  <div key={s}>
                    <StateTag>{s}</StateTag>
                    <SectionChips platform="web" layout="chips" state={s} className="px-4" />
                  </div>
                ))}
                <StateTag>day heading · title · full · read Saturday 11:55 PM · ceremony</StateTag>
                <div className="space-y-3 px-4">
                  <DayHeading platform="web" state="title" />
                  <DayHeading platform="web" state="full" />
                  <DayHeading platform="web" state="full" now={SAT_NIGHT} />
                  <DayHeading platform="web" state="full" section="ceremony" />
                </div>
              </BrowserSlab>
            </Specimen>
          </div>

          <div className="mt-20">
            <Specimen caption="SectionChips · web rail · empty · none · all · prep · ceremony · reception">
              <BrowserSlab url={FRAME_URLS.album} rotateX={4} className="w-full max-w-[1120px]" viewportClassName="p-4 sm:p-6">
                <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
                  {CHIP_STATES.map((s) => (
                    <div key={s} className="min-w-0">
                      <p className="figure mb-3 text-[11px] uppercase tracking-[0.14em] text-[#A08E84]">{s}</p>
                      <SectionChips platform="web" layout="rail" state={s} />
                    </div>
                  ))}
                </div>
              </BrowserSlab>
            </Specimen>
          </div>
        </Section>

        <Section
          n="02 · Ch5 · B10"
          title="Album screen, phone"
          note="The same album on the phone: NativeWind radii (pills at 14, buttons at 12), the retention pill the phone header carries, chips with the kind segment under them, and three square columns on 2 px hairlines. Arriving shows Kenn’s film first (9:24 PM), then Ernie’s batch, then Mika’s. The order toggle reads Oldest: the grid runs the day forward. A chip filters, so the Prep screen shows Prep alone."
        >
          {/* Phones at 390 px, a common phone width: the album header's title, its two buttons and the kind segment need the room. */}
          <div className="mx-auto grid max-w-[880px] gap-x-12 gap-y-16 md:grid-cols-2">
            <Specimen caption="empty · Friday 9:34 PM, just made · Draft · Empty · the app’s empty album">
              <PhoneSlab rotateY={-10} time="9:34" className="w-[min(100%,390px)]">
                <PhoneAlbumScreen header="empty" chips="empty" grid="empty" />
              </PhoneSlab>
            </Specimen>
            <Specimen caption="arriving · Saturday 11:55 PM · the day reads Today · no sections yet · upload order, stamped">
              <PhoneSlab rotateY={-4} time="11:55" className="w-[min(100%,390px)]">
                <PhoneAlbumScreen header="draft" chips="none" grid="arriving" now={SAT_NIGHT} />
              </PhoneSlab>
            </Specimen>
            <Specimen caption="rest · Monday · sections filed · capture order">
              <PhoneSlab rotateY={4} className="w-[min(100%,390px)]">
                <PhoneAlbumScreen header="draft" chips="all" grid="sorted" />
              </PhoneSlab>
            </Specimen>
            <Specimen caption="Prep chip · the grid narrows to Prep · 96 items">
              <PhoneSlab rotateY={10} className="w-[min(100%,390px)]">
                <PhoneAlbumScreen header="draft" chips="prep" grid="sorted" />
              </PhoneSlab>
            </Specimen>
          </div>

          <div className="mt-20 grid gap-x-8 gap-y-16 md:grid-cols-2">
            <Specimen caption="AlbumHeader · phone · empty · draft · delivered · cleared">
              <PhoneSlab rotateY={-8} ratio={0}>
                <div className="pb-6">
                  {HEADER_STATES.map((s) => (
                    <div key={s}>
                      <StateTag>{s}</StateTag>
                      <AlbumHeader platform="phone" state={s} />
                    </div>
                  ))}
                </div>
              </PhoneSlab>
            </Specimen>
            <Specimen caption="SectionChips · phone · empty · none · all · prep · ceremony · reception · DayHeading">
              <PhoneSlab rotateY={8} ratio={0}>
                <div className="pb-6">
                  {CHIP_STATES.map((s) => (
                    <div key={s}>
                      <StateTag>{s}</StateTag>
                      <SectionChips platform="phone" state={s} kinds={s === 'empty' || s === 'all'} />
                    </div>
                  ))}
                  <StateTag>day heading · title · full · prep</StateTag>
                  <DayHeading platform="phone" state="title" />
                  <DayHeading platform="phone" state="full" />
                  <DayHeading platform="phone" state="full" section="prep" />
                </div>
              </PhoneSlab>
            </Specimen>
          </div>
        </Section>

        <Section
          n="03 · Ch5 · B7"
          title="Film tile"
          note={`Kenn’s same-day edit: three Plates crossfaded, the badge each surface draws, and a progress bar. Web and phone badges read “${ALBUM.sameDayEditDuration}”; the client page’s reads “▶ ${ALBUM.sameDayEditDuration}” (for Ch6). Pulse is the beat at Kenn’s laptop chip.`}
        >
          <div className="grid gap-x-8 gap-y-16 lg:grid-cols-[1.4fr_1fr_1fr]">
            <Specimen caption="web · poster · pulse · playing">
              <BrowserSlab url={FRAME_URLS.album} rotateY={-5} viewportClassName="p-4">
                <div className="grid grid-cols-3 gap-2">
                  {FILM_STATES.map((s) => (
                    <div key={s}>
                      <FilmTile look="web" state={s} />
                      <p className="figure mt-2 text-center text-[11px] text-[#A08E84]">{s}</p>
                    </div>
                  ))}
                </div>
              </BrowserSlab>
            </Specimen>
            <Specimen caption="phone · poster · pulse · playing">
              <PhoneSlab rotateY={0} ratio={0} className="w-[min(100%,390px)]">
                <div className="grid grid-cols-3 gap-[2px] pb-8 pt-2">
                  {FILM_STATES.map((s) => (
                    <div key={s}>
                      <FilmTile look="phone" state={s} />
                      <p className="mt-2 text-center text-[11px] text-[#A08E84]">{s}</p>
                    </div>
                  ))}
                </div>
              </PhoneSlab>
            </Specimen>
            <Specimen caption="client page · 16:9 · poster · pulse · playing" day={false}>
              <PhoneSlab rotateY={8} ratio={0} tone="dark" screen="#FBF7F2" className="w-[min(100%,390px)]">
                <div className="flex flex-col gap-2 px-4 pb-8 pt-2">
                  {FILM_STATES.map((s) => (
                    <FilmTile key={s} look="client" state={s} aspect="16:9" />
                  ))}
                </div>
              </PhoneSlab>
            </Specimen>
          </div>
        </Section>

        <Section
          n="04 · Ch5"
          title="Device chips"
          note="Where the gold threads start: Mika’s camera, Ernie’s camera, Kenn’s laptop. Page chrome, not app UI, on the golden ground; the faces are PersonAvatar’s (first and last initials), so they match the activity feed. The port dot is where a thread leaves."
        >
          <div className="rounded-[28px] px-4 py-14 sm:px-10" style={{ background: GOLD }}>
            <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-10">
              {(['mika', 'ernie', 'kenn'] as const).map((who, i) => (
                <Slab key={who} rotateX={10} rotateY={(i - 1) * 8} depth={6} radius="rounded-[18px]" edge="card" shadow="drop" sheen={false}>
                  <DeviceChip who={who} />
                </Slab>
              ))}
            </div>
            <div className="mt-14 flex flex-wrap items-start justify-center gap-x-10 gap-y-10">
              {DEVICE_STATES.map((s) => (
                <Specimen key={s} caption={`mika · ${s}`} day>
                  <Slab rotateX={10} depth={6} radius="rounded-[18px]" edge="card" shadow="drop" sheen={false}>
                    <DeviceChip who="mika" state={s} />
                  </Slab>
                </Specimen>
              ))}
            </div>
          </div>
        </Section>

        <Section
          n="05 · Ch5 · B10"
          title="Activity"
          note="“What’s been happening”: describeActivity and relativeTime from lib/workspaces.ts over three folded upload rows. The line names the album, the subline is the role, the time reads “Sat” from Monday morning. Rows fill from the bottom, newest on top, and keep their room."
        >
          <div className="grid gap-x-8 gap-y-16 lg:grid-cols-[1.3fr_1fr]">
            <Specimen caption="web · all · rest">
              <BrowserSlab url={FRAME_URLS.workspace} rotateY={-4} viewportClassName="p-4 sm:p-6">
                <ActivityFeed platform="web" state="all" />
              </BrowserSlab>
            </Specimen>
            <Specimen caption="phone · all · rest">
              <PhoneSlab rotateY={6} ratio={0} className="w-[min(100%,390px)]">
                <div className="px-4 pb-8 pt-2">
                  <ActivityFeed platform="phone" state="all" />
                </div>
              </PhoneSlab>
            </Specimen>
          </div>
          <div className="mt-16 grid gap-x-6 gap-y-14 md:grid-cols-3">
            {FEED_STATES.filter((s) => s !== 'all').map((s, i) => (
              <Specimen key={s} caption={`web · ${s}`}>
                <BrowserSlab url={FRAME_URLS.workspace} rotateY={(i - 1) * 5} viewportClassName="p-4">
                  <ActivityFeed platform="web" state={s} />
                </BrowserSlab>
              </Specimen>
            ))}
          </div>
          <div className="mt-16 flex justify-center">
            <Specimen caption="web · all · read at Saturday 11:55 PM instead of Monday: relativeTime says 7m ago · 1h ago · 2h ago" className="w-full max-w-[720px]">
              <BrowserSlab url={FRAME_URLS.workspace} rotateX={4} viewportClassName="p-4 sm:p-6">
                <ActivityFeed platform="web" state="all" now={SAT_NIGHT} />
              </BrowserSlab>
            </Specimen>
          </div>
          <div className="mt-16 flex justify-center">
            <Specimen caption="phone · empty · first · second">
              <PhoneSlab rotateY={-6} ratio={0} className="w-[min(100%,390px)]">
                <div className="space-y-2 px-4 pb-8 pt-2">
                  {FEED_STATES.filter((s) => s !== 'all').map((s) => (
                    <div key={s}>
                      <p className="figure pb-2 text-[11px] uppercase tracking-[0.14em] text-[#A08E84]">{s}</p>
                      <ActivityFeed platform="phone" state={s} />
                    </div>
                  ))}
                </div>
              </PhoneSlab>
            </Specimen>
          </div>
        </Section>

        <Section
          n="06 · Ch5 · Ch7 · B10"
          title="Storage meter"
          note="One meter, Mika’s: formatBytes (copied) over story.ts’s readings as GiB, which the app calls GB. Under 1 GiB the app writes MB, so the 0.3 GB baseline reads “307 MB”. The bar is scaleX; the ring is two rotated half-rings with round caps, never a stroke-dash."
        >
          <div className="grid items-center gap-x-8 gap-y-16 lg:grid-cols-[1.3fr_1fr]">
            <Specimen caption="web · saturday · rest">
              <BrowserSlab url={FRAME_URLS.storage} rotateY={-4} viewportClassName="p-4 sm:p-8">
                <StorageMeter platform="web" state="saturday" className="mx-auto max-w-3xl" />
              </BrowserSlab>
            </Specimen>
            <Specimen caption="phone · saturday · rest">
              <PhoneSlab rotateY={6} ratio={0} className="w-[min(100%,390px)]">
                <div className="px-5 pb-8 pt-3">
                  <StorageMeter platform="phone" state="saturday" />
                </div>
              </PhoneSlab>
            </Specimen>
          </div>
          <div className="mt-16 grid gap-x-8 gap-y-16 lg:grid-cols-[1.3fr_1fr]">
            <Specimen caption="web · every state">
              <BrowserSlab url={FRAME_URLS.storage} rotateY={4} viewportClassName="p-4 sm:p-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  {METER_STATES.map(({ state, note }) => (
                    <div key={state}>
                      <p className="figure pb-2 text-[11px] uppercase tracking-[0.14em] text-[#A08E84]">{note}</p>
                      <StorageMeter platform="web" state={state} />
                    </div>
                  ))}
                </div>
              </BrowserSlab>
            </Specimen>
            <Specimen caption="phone · every state">
              <PhoneSlab rotateY={-6} ratio={0} className="w-[min(100%,390px)]">
                <div className="space-y-3 px-5 pb-8 pt-3">
                  {METER_STATES.map(({ state, note }) => (
                    <div key={state}>
                      <p className="figure pb-2 text-[11px] uppercase tracking-[0.14em] text-[#A08E84]">{note}</p>
                      <StorageMeter platform="phone" state={state} />
                    </div>
                  ))}
                </div>
              </PhoneSlab>
            </Specimen>
          </div>
        </Section>

        <Section
          n="07 · Ch5"
          title="Viewfinder"
          note="Golden hour, 5:05 PM: four corner marks and “1/250 · f/2.8 · ISO 200”. Ink marks on gold (white would be under 2:1), the readout on its own dark pill; light marks on night. Mobile uses marks only."
        >
          <div className="rounded-[28px] px-4 py-12 sm:px-10" style={{ background: GOLD }}>
            <div className="grid gap-x-6 gap-y-12 md:grid-cols-3">
              {VF_STATES.map((s, i) => (
                <Specimen key={s} caption={`gold · ${s}`} day>
                  <Slab className="w-full" rotateX={6} rotateY={(i - 1) * 6} depth={8} radius="rounded-2xl" edge="card">
                    <div className="relative">
                      <div className="aspect-[3/2]" style={{ background: STAGE }} />
                      <Viewfinder state={s} tone="gold" />
                    </div>
                  </Slab>
                </Specimen>
              ))}
            </div>
          </div>
          <div className="mt-12 flex justify-center">
            <Specimen caption="night · readout" className="w-full max-w-[520px]">
              <Slab className="w-full" rotateX={6} depth={8} radius="rounded-2xl" edge="card">
                <div className="relative">
                  <Plate seed={63} aspect="3:2" variant="full" />
                  <Viewfinder state="readout" tone="night" />
                </div>
              </Slab>
            </Specimen>
          </div>
        </Section>

        {/* ─── Ch7 ─────────────────────────────────────────────────────── */}

        <Section
          n="08 · Ch7 · B10"
          title="Keep files for"
          note="The web New album dialog, where retention is set once. The six choices are the web’s, in order, with “Until I delete them” first; the helper is the dialog’s own template. Both values and helpers are always drawn, stacked, so the trigger keeps one width through the flip."
        >
          <div className="grid items-start gap-x-8 gap-y-16 lg:grid-cols-[1.2fr_1fr]">
            <Specimen caption="dialog · chosen · rest">
              <BrowserSlab url={FRAME_URLS.album} rotateY={-4} viewportClassName="grid place-items-center bg-[rgba(0,0,0,0.25)] px-4 py-10 sm:py-14">
                <RetentionField variant="dialog" state="chosen" className="w-full max-w-sm" />
              </BrowserSlab>
            </Specimen>
            <div className="grid gap-y-10">
              {RETENTION_STATES.map((s, i) => (
                <Specimen key={s} caption={`field · ${s}`}>
                  <BrowserSlab
                    url={FRAME_URLS.album}
                    rotateY={(i - 1) * 4}
                    viewportClassName={`px-4 py-5 ${s === 'open' ? 'pb-44' : ''}`}
                  >
                    <RetentionField state={s} />
                  </BrowserSlab>
                </Specimen>
              ))}
            </div>
          </div>
        </Section>

        <Section
          n="09 · Ch7"
          title="Day ruler"
          note="Day 0 to Day 112. The ruler is one path — the axis, a tick a week and a guide per upload cohort — stretched to the width with non-scaling strokes. Over it, one element each: a cohort’s density marks (413, 3, 6 files) and the gold span of the time its files have left, which fade at its sweep (Day 91, 92, 112; 3 AM) while its ring lights. The playhead is a full-width layer moved by translateX."
        >
          <Specimen caption="overview · rest · the reduced-motion figure">
            <Slab className="w-full max-w-[1000px]" rotateX={8} depth={8} radius="rounded-2xl" edge="card">
              <div className="bg-[#161311] p-5 sm:p-8">
                <DayRuler state="overview" />
              </div>
            </Slab>
          </Specimen>
          <div className="mt-16 grid gap-x-8 gap-y-14 md:grid-cols-2">
            {RULER_STATES.map((s, i) => (
              <Specimen key={s} caption={s}>
                <Slab className="w-full" rotateX={6} rotateY={i % 2 === 0 ? -5 : 5} depth={8} radius="rounded-2xl" edge="card">
                  <div className="bg-[#161311] p-5">
                    <DayRuler state={s} />
                  </div>
                </Slab>
              </Specimen>
            ))}
          </div>
          <div className="mt-16 flex justify-center">
            <Specimen caption="vertical · reduced motion on phones · each sweep carries its notice">
              <PhoneSlab rotateY={-6} ratio={0} time={READ.clock} className="w-[min(100%,390px)]">
                <div className="px-5 pb-10 pt-4">
                  <DayRuler orientation="vertical" />
                </div>
              </PhoneSlab>
            </Specimen>
          </div>
        </Section>

        <Section
          n="10 · Ch7 · shared"
          title="Clean-up notices and the emptied link"
          note={`The receipts album-retention.service.ts sends after each sweep, never before, through the shared NotificationRow (Albums: chart-3 on the web, the brand accent on the phone). Each reads as it would the morning it arrives. Below, the same link after the last sweep: Ch6’s ClientGalleryPage in its empty state, “${CLIENT_EMPTY}”`}
        >
          <div className="grid items-start gap-x-8 gap-y-16 lg:grid-cols-[1.3fr_1fr]">
            <Specimen caption="web · Day 91 · Day 92 · Day 112 · read at 8:05 AM: a time of day under Today">
              <BrowserSlab url={FRAME_URLS.notifications} rotateY={-4} viewportClassName="space-y-4 p-4 sm:p-6">
                {CLEANUPS.map((c) => (
                  <div key={c.id}>
                    <p className="figure pb-2 text-[11px] uppercase tracking-[0.14em] text-[#A08E84]">day {c.day}</p>
                    <NotificationList platform="web" heading={TODAY}>
                      <NotificationRow platform="web" topic={c.topic} title={c.title} body={c.body} time={c.time} />
                    </NotificationList>
                  </div>
                ))}
              </BrowserSlab>
            </Specimen>
            <Specimen caption="phone · Day 91 · Day 92 · Day 112 · read at 8:05 AM: today’s rows say how long ago, 5h">
              <PhoneSlab rotateY={6} ratio={0} time={READ.clock} className="w-[min(100%,390px)]">
                <div className="pb-8">
                  {CLEANUPS.map((c) => (
                    <NotificationList key={c.id} platform="phone" heading={TODAY}>
                      <NotificationRow platform="phone" first topic={c.topic} title={c.title} body={c.body} time={c.phoneTime} />
                    </NotificationList>
                  ))}
                </div>
              </PhoneSlab>
            </Specimen>
          </div>
          <div className="mt-16 flex justify-center">
            <Specimen caption="client page · after Day 112 · ClientGalleryPage state=empty (Ch6’s mock) · light, as the couple’s phone shows it">
              <PhoneSlab rotateY={-6} time={READ.clock} tone="dark" screen="#FBF7F2" className="w-[min(100%,390px)]">
                <ClientGalleryPage className="absolute inset-0" state="empty" browserBar />
              </PhoneSlab>
            </Specimen>
          </div>
        </Section>

        <Section
          n="11 · Ch5 · Ch7 · B10"
          title="Album card"
          note="The albums list’s card. Ch5 ends by folding the grid into it; Ch7 ends on it emptied: Delivered, no cover, “Empty”. The time is the app’s own ago() (web) or timeAgo() (phone) with a fixed now — the album row changes only when it is made or its status set."
        >
          <div className="grid items-start gap-x-8 gap-y-16 lg:grid-cols-[1.4fr_1fr]">
            <Specimen caption="web · draft · delivered · empty (rest)">
              <BrowserSlab url={FRAME_URLS.albums} rotateY={-4} viewportClassName="p-4 sm:p-6">
                <div className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-4">
                  {CARD_STATES.map((s) => (
                    <div key={s}>
                      <p className="figure pb-2 text-[11px] uppercase tracking-[0.14em] text-[#A08E84]">{s}</p>
                      <AlbumCard platform="web" state={s} />
                    </div>
                  ))}
                </div>
              </BrowserSlab>
            </Specimen>
            <Specimen caption="phone · draft · delivered · empty (rest)">
              <PhoneSlab rotateY={6} ratio={0} className="w-[min(100%,390px)]">
                <div className="grid grid-cols-2 gap-3 px-4 pb-8 pt-2">
                  {CARD_STATES.map((s) => (
                    <div key={s}>
                      <p className="pb-1.5 text-[11px] uppercase tracking-[0.1em] text-[#A08E84]">{s}</p>
                      <AlbumCard platform="phone" state={s} />
                    </div>
                  ))}
                </div>
              </PhoneSlab>
            </Specimen>
          </div>
        </Section>

        {/* ─── Depth ───────────────────────────────────────────────────── */}

        <Section
          n="12 · §1.13"
          title="Depth, moving"
          note="The Ch5 signature beat in CSS 3D: Saturday’s frames gather into one stack, then fan back in depth into capture order — Prep nearest, Reception furthest — staggered 60 ms a tile, while the device chips float at their own depths. Then a phone slab turning (±10° on phones, ±16° from 768) with its sheens crossfading, and the emptied album card lifting on its shadow. Transform and opacity only."
        >
          <div className="overflow-x-clip rounded-[28px] bg-[radial-gradient(120%_90%_at_50%_0%,#2a1c12,#161311_70%)] px-2 py-10 sm:px-6">
            <FanScene />
          </div>

          <div className="mt-16 grid items-center gap-x-8 gap-y-16 md:grid-cols-2">
            <Specimen caption="slab turning · sheens crossfade">
              <Slab
                className="lab57-turn w-[min(100%,390px)]"
                rotateY={-10}
                rotateX={5}
                depth={14}
                radius={PHONE_RADIUS}
                edge="device"
                shadow="floor"
              >
                <PhoneFrame width="100%" time="9:00">
                  <PhoneAlbumScreen header="draft" chips="all" grid="sorted" />
                </PhoneFrame>
              </Slab>
            </Specimen>
            <Specimen caption="card lifting · translateZ 0 → 56 · shadow scales and fades">
              <Slab className="lab57-lift w-[min(100%,300px)]" rotateX={12} rotateY={8} depth={8} radius="rounded-xl" edge="card">
                <AlbumCard platform="web" state="empty" />
              </Slab>
            </Specimen>
          </div>

          <div className="mt-20">
            <p className="figure mb-4 text-center text-[11px] uppercase tracking-[0.14em] text-[#A08E84]">
              scroll-linked · animation-timeline: view() · scroll this row through the window
            </p>
            <div className="overflow-x-clip rounded-[28px] bg-[#1A1715] px-2 py-10 sm:px-6">
              <FanScene scroll />
            </div>
          </div>
        </Section>
      </div>
    </main>
  );
}
