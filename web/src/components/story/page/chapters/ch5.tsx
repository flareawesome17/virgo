import { NOW } from '../../data/story';
import { FRAME_URLS, TILE_SETS, ALBUM_TILES } from '../../data/strings/ch5';
import { CH5 } from '../../data/strings/page-ch5';
import { BROWSER_RADIUS, BrowserFrame, Perspective, Slab } from '../../frames';
import { ActivityFeed } from '../../mocks/activity-feed';
import { AlbumGrid } from '../../mocks/album-grid';
import { AlbumHeader } from '../../mocks/album-header';
import { DeviceChip } from '../../mocks/device-chip';
import { FilmTile } from '../../mocks/film-tile';
import { Plate } from '../../mocks/plate';
import { SectionChips } from '../../mocks/section-chips';
import { StorageMeter, meterReading } from '../../mocks/storage-meter';
import { Viewfinder } from '../../mocks/viewfinder';
import { Ch5Stage } from '../islands/ch5';

/**
 * Ch5 — Saturday · #saturday (storyboard §2 Ch5): the emotional peak and the
 * page's one long pin.
 *
 * Static (reduced motion, no JS): no pin. A golden band starts at a drawn
 * horizon with "Saturday." and a still sun, then the finished album, the
 * legend of the three sources, the activity and the meter at 6.3 GB.
 *
 * Motion: the same content sits in a sticky full-viewport stage; the island
 * (islands/ch5.tsx) turns night into golden hour with opacity-only layers,
 * steps the time chip, flies the crew's tiles into the album and fills the
 * meter.
 */

/** The golden ground, as pre-baked stops (§1.4). */
const GOLD = 'linear-gradient(180deg, #F7E7CF 0%, #F0C88E 38%, #E8A86E 72%, #D98A55 100%)';
/** The album at 11:55 PM on Saturday: its day heading reads "Today". */
const SAT_NIGHT = NOW.ch5;

const M = {
  track: "[html[data-motion='on']_&]:h-[180svh] lg:[html[data-motion='on']_&]:h-[260svh]",
};

/** "Saturday." — the sun is its full stop. aria-hidden display type. */
function SaturdayWord({ className = '' }: { className?: string }) {
  return (
    <p aria-hidden className={`select-none font-semibold leading-[0.86] tracking-[-0.05em] ${className}`}>
      {CH5.display}
      <span className="relative ml-[0.04em] inline-block size-[0.2em] rounded-full bg-[#FFE7C2] align-baseline shadow-[0_0_0.35em_0.08em_rgba(255,231,194,0.85),0_0_1.2em_0.3em_rgba(240,200,142,0.45)]" />
    </p>
  );
}

/** The time chip: a night surface and a paper surface, five faces each. */
function TimeChip() {
  const faces = (ink: string, sub: string) =>
    CH5.chip.map((c, i) => (
      <span
        key={c.time}
        data-face={i}
        className="col-start-1 row-start-1 flex items-center justify-center gap-2 whitespace-nowrap"
        style={{ opacity: i === 0 ? 1 : 0 }}
      >
        {i === 0 && <span className={sub}>{CH5.chipDay} ·</span>}
        <time className={`tabular-nums ${ink}`}>{c.time}</time>
        <span className={sub}>· {c.label}</span>
      </span>
    ));
  return (
    <div
      data-part="c5-chip"
      aria-hidden
      className="absolute left-1/2 top-[72px] z-30 -translate-x-1/2 font-mono text-[12px] uppercase tracking-[0.14em] lg:top-[88px]"
    >
      <div className="relative">
        <div data-part="c5-chip-night" className="grid rounded-full bg-[#1E1B18] px-4 py-2.5 ring-1 ring-[rgba(242,237,232,0.12)]">
          {faces('text-[#F2EDE8]', 'text-[#BCADA3]')}
        </div>
        <div
          data-part="c5-chip-paper"
          className="absolute inset-0 grid rounded-full bg-[#FBF7F2] px-4 py-2.5 shadow-[0_10px_30px_-12px_rgba(122,62,30,0.45)]"
          style={{ opacity: 0 }}
        >
          {faces('text-[#1E1B18]', 'text-[#7A3E1E]')}
        </div>
      </div>
    </div>
  );
}

/** The light: night, pre-dawn and golden layers, the sun, the bloom, the viewfinder, "Saturday." (motion only). */
function Sky() {
  return (
    <div aria-hidden className="motion-only pointer-events-none absolute inset-0 overflow-clip">
      <div data-part="c5-gold" className="absolute inset-0" style={{ background: GOLD, opacity: 0 }} />
      <div
        data-part="c5-dawn"
        className="absolute inset-0 bg-[linear-gradient(180deg,#161311_0%,#24180f_40%,#6B3E25_68%,#3b2417_100%)]"
        style={{ opacity: 0 }}
      />
      <div data-part="c5-night" className="absolute inset-0 bg-[radial-gradient(120%_60%_at_50%_100%,#2a1d15_0%,#1E1A17_30%,#161311_70%)]">
        <div
          data-part="c5-stars"
          className="absolute inset-x-0 top-0 h-[60%] opacity-90 [background-image:radial-gradient(1.5px_1.5px_at_12%_22%,#F2EDE8,transparent),radial-gradient(1px_1px_at_28%_48%,#BCADA3,transparent),radial-gradient(1.5px_1.5px_at_46%_14%,#F2EDE8,transparent),radial-gradient(1px_1px_at_64%_36%,#BCADA3,transparent),radial-gradient(1.5px_1.5px_at_78%_18%,#F2EDE8,transparent),radial-gradient(1px_1px_at_88%_52%,#BCADA3,transparent),radial-gradient(1px_1px_at_8%_62%,#A08E84,transparent),radial-gradient(1px_1px_at_56%_58%,#A08E84,transparent)]"
        />
      </div>
      {/* The horizon line. */}
      <div className="absolute inset-x-0 top-[68%] h-px bg-[linear-gradient(90deg,rgba(240,200,142,0)_0%,rgba(240,200,142,0.75)_50%,rgba(240,200,142,0)_100%)]" />
      {/* Mika's star becomes the low sun. */}
      <div data-part="c5-sun" className="absolute left-[62%] top-[68%] size-[96px] lg:size-[150px]" style={{ transform: 'translate3d(-50%,-50%,0) scale(0.18)' }}>
        <div className="absolute -inset-[120%] rounded-full bg-[radial-gradient(closest-side,rgba(255,231,194,0.55),rgba(240,200,142,0.18)_45%,rgba(240,200,142,0)_100%)]" />
        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_45%_40%,#FFF3DF_0%,#FFE7C2_55%,#F6D2A0_100%)]" />
      </div>
      {/* One soft bloom at p 0.27, never above 0.25 (§1.7). */}
      <div
        data-part="c5-bloom"
        className="absolute left-[62%] top-[50%] size-[140vmax] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(255,240,214,1),rgba(255,231,194,0.4)_40%,rgba(255,231,194,0)_100%)]"
        style={{ opacity: 0 }}
      />
      <div data-part="c5-vf" className="absolute inset-[14%_6%_18%] lg:inset-[16%_14%_14%]" style={{ opacity: 0 }}>
        <Viewfinder state="readout" tone="gold" className="hidden lg:block" />
        <Viewfinder state="marks" tone="gold" className="lg:hidden" />
      </div>
      <div data-part="c5-word" className="absolute inset-x-0 top-[68%] -translate-y-full px-5 pb-[1.5vh] lg:px-0 lg:text-center" style={{ opacity: 0 }}>
        <SaturdayWord className="text-[22vw] text-[#1E1B18] lg:text-[clamp(3.5rem,15vw,13rem)]" />
      </div>
      {/* The crest: the same-day edit plays at the reception. */}
      <div data-part="c5-crest" className="absolute inset-x-0 top-[24%] flex flex-col items-center gap-4 px-5" style={{ opacity: 0 }}>
        <DeviceChip who="kenn" state="sending" />
        <Slab className="w-[220px] lg:w-[300px]" rotateX={6} rotateY={-8} depth={8} radius="rounded-[14px]" edge="card">
          <FilmTile look="web" state="pulse" aspect="16:9" />
        </Slab>
        <p className="rounded-full bg-[rgba(251,247,242,0.94)] px-4 py-2 font-mono text-[12px] uppercase tracking-[0.12em] text-[#1E1B18]">
          {CH5.crest}
        </p>
      </div>
    </div>
  );
}

/** The static page's horizon band: "Saturday." standing on a drawn horizon, a still sun (static only). */
function StaticHorizon() {
  return (
    <div aria-hidden className="static-only relative h-[44svh] min-h-[300px] overflow-clip bg-[linear-gradient(180deg,#161311_0%,#2b1c13_45%,#6B3E25_78%,#B4703F_100%)]">
      <div className="absolute bottom-0 left-[64%] size-[120px] -translate-x-1/2 translate-y-1/2 rounded-full bg-[radial-gradient(circle_at_45%_40%,#FFF3DF_0%,#FFE7C2_55%,#F6D2A0_100%)] shadow-[0_0_80px_30px_rgba(255,231,194,0.35)]" />
      <div className="absolute inset-x-0 bottom-0 h-px bg-[linear-gradient(90deg,rgba(240,200,142,0)_0%,rgba(255,231,194,0.95)_50%,rgba(240,200,142,0)_100%)]" />
      <div className="absolute inset-x-0 bottom-3 mx-auto max-w-6xl px-5 sm:px-8">
        <SaturdayWord className="text-[22vw] text-[#FBF7F2] lg:text-[clamp(3.5rem,13vw,12rem)]" />
      </div>
    </div>
  );
}

/** Four abstract tiles per device, for the flights (desktop motion only). */
function Flights({ seeds }: { seeds: number[] }) {
  return (
    <>
      {seeds.map((seed) => (
        <div
          key={seed}
          data-part="c5-fly"
          aria-hidden
          className="motion-only pointer-events-none absolute left-1/2 top-1/2 -ml-6 -mt-6 size-12 overflow-hidden rounded-[8px] shadow-[0_14px_30px_-12px_rgba(60,30,10,0.7)] ring-1 ring-[rgba(255,255,255,0.4)]"
          style={{ opacity: 0 }}
        >
          <Plate seed={seed} aspect="fill" />
        </div>
      ))}
    </>
  );
}

const WHO = ['mika', 'ernie', 'kenn'] as const;

function Album() {
  const seeds = TILE_SETS[12].map((i) => ALBUM_TILES[i].seed);
  return (
    <div className="relative">
      {/* The legend: the three sources and what each sent (the threads start here). */}
      <p className="static-only mb-3 font-mono text-[12px] uppercase tracking-[0.14em] text-[#7A3E1E]">{CH5.legendTitle}</p>
      <div className="relative z-20 mb-5 flex flex-wrap gap-2 lg:mb-6 lg:flex-nowrap lg:justify-between lg:gap-3">
        {WHO.map((who, i) => (
          <div key={who} data-part="c5-dev-slot" className={`relative max-lg:[html[data-motion='on']_&]:hidden`}>
            <div data-part="c5-dev">
              <DeviceChip who={who} state="sent" port="bottom" />
            </div>
            <Flights seeds={seeds.slice(i * 4, i * 4 + 4)} />
          </div>
        ))}
      </div>

      {/* The gold threads: device → album (opacity only, never a dash). */}
      <svg
        aria-hidden
        data-part="c5-threads"
        className="motion-only pointer-events-none absolute inset-x-0 top-6 z-10 hidden h-[160px] w-full lg:block"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ opacity: 0 }}
      >
        {[12, 50, 88].map((x) => (
          <path
            key={x}
            d={`M ${x} 0 C ${x} 55, 50 45, 50 100`}
            fill="none"
            stroke="url(#c5-thread)"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
            strokeLinecap="round"
          />
        ))}
        <defs>
          <linearGradient id="c5-thread" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFE7C2" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#D98A55" stopOpacity="0.5" />
          </linearGradient>
        </defs>
      </svg>

      <div data-part="c5-album-anchor" className="relative [--story-p:900] [perspective:calc(var(--story-p)*1px)] md:[--story-p:1200]">
        <div data-part="c5-album" className="[transform-style:preserve-3d] [html[data-motion='on']_&]:opacity-0" style={{ transform: 'rotateX(4deg) rotateY(-2deg)' }}>
          {/* Desktop: the web album. */}
          <div className="hidden lg:block">
            <Slab className="w-full" rotateX={0} rotateY={0} depth={10} radius={BROWSER_RADIUS} edge="card" shadow="drop">
              <BrowserFrame url={FRAME_URLS.album}>
                <AlbumHeader platform="web" state="draft" />
                <div className="px-5 pb-5 pt-4 [&_[data-part=grid]]:grid-cols-4">
                  <SectionChips platform="web" layout="chips" state="all" className="mb-3" />
                  <AlbumGrid platform="web" count={12} state="sorted" now={SAT_NIGHT} maxRows={2} />
                </div>
              </BrowserFrame>
            </Slab>
          </div>
          {/* Phones: the phone album, as a card. */}
          <div className="lg:hidden">
            <Slab className="w-full" rotateX={0} rotateY={0} depth={10} radius="rounded-[24px]" edge="card" shadow="drop">
              <div className="overflow-hidden rounded-[24px] bg-[#161311] pb-3">
                <AlbumHeader platform="phone" state="draft" />
                <SectionChips platform="phone" state="all" kinds={false} />
                <AlbumGrid platform="phone" count={9} state="sorted" now={SAT_NIGHT} />
              </div>
            </Slab>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Activity and the one meter, lifted in front of the album (desktop), or after the pin (phones). */
function ActivityAndMeter({ className = '' }: { className?: string }) {
  return (
    <Perspective className={className}>
      <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        <Slab className="w-full" rotateX={4} rotateY={6} depth={8} radius="rounded-xl" edge="card">
          <ActivityFeed platform="web" state="all" now={SAT_NIGHT} />
        </Slab>
        <Slab className="w-full self-end" rotateX={4} rotateY={-6} depth={8} radius="rounded-xl" edge="card">
          <StorageMeter platform="web" state="saturday" />
        </Slab>
      </div>
    </Perspective>
  );
}

const PAPER = 'bg-[rgba(251,247,242,0.94)] text-[#1E1B18]';

function Copy() {
  const [split, kept, meter] = CH5.beats;
  const stack = "[html[data-motion='on']_&]:col-start-1 [html[data-motion='on']_&]:row-start-1 lg:[html[data-motion='on']_&]:row-start-2";
  return (
    <div
      data-part="c5-copy"
      className={`relative z-30 flex flex-col gap-8 rounded-3xl p-6 shadow-[0_30px_60px_-30px_rgba(122,62,30,0.55)] ring-1 ring-[rgba(122,62,30,0.12)] sm:p-8 ${PAPER} [html[data-motion='on']_&]:grid [html[data-motion='on']_&]:gap-6 max-lg:[html[data-motion='on']_&]:absolute max-lg:[html[data-motion='on']_&]:inset-x-3 max-lg:[html[data-motion='on']_&]:bottom-3 max-lg:[html[data-motion='on']_&]:max-h-[44svh] max-lg:[html[data-motion='on']_&]:p-5 [html[data-motion='on']_&]:opacity-0`}
    >
      <div data-part="c5-beat-0" className="[html[data-motion='on']_&]:col-start-1 [html[data-motion='on']_&]:row-start-1">
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-[#7A3E1E]">{CH5.eyebrow}</p>
        <h2 className="mt-3 max-w-[18ch] text-[clamp(2rem,1.3rem+3.4vw,4.25rem)] font-semibold leading-none tracking-[-0.03em] max-lg:[html[data-motion='on']_&]:text-[1.75rem] lg:text-[clamp(2rem,1rem+2.6vw,3.5rem)]">
          {CH5.h2}
        </h2>
        <p className="mt-5 max-w-[34ch] text-base leading-[1.6] text-[#1E1B18] sm:max-w-[46ch] lg:text-[17px] max-lg:[html[data-motion='on']_&]:mt-3 max-lg:[html[data-motion='on']_&]:text-[15px] max-lg:[html[data-motion='on']_&]:leading-[1.5]">
          {CH5.lead}
        </p>
        <p className="mt-4 max-w-[46ch] font-mono text-[12px] uppercase leading-relaxed tracking-[0.08em] text-[#6F5C52] max-lg:[html[data-motion='on']_&]:mt-2">{CH5.aside}</p>
      </div>
      <div data-part="c5-beat-1" className={stack}>
        <h3 className="text-[clamp(1.25rem,1.1rem+0.8vw,1.625rem)] font-semibold leading-[1.2]">{split.h3}</h3>
        <p className="mt-2 text-base leading-[1.6] lg:text-[17px]">{split.body}</p>
      </div>
      <div data-part="c5-beat-2" className={stack}>
        <h3 className="text-[clamp(1.25rem,1.1rem+0.8vw,1.625rem)] font-semibold leading-[1.2]">{kept.h3}</h3>
        <p className="mt-2 text-base leading-[1.6] lg:text-[17px]">{kept.body}</p>
      </div>
      {/* Desktop: the third H3 is in the pin; phones read it after the pin releases. */}
      <div data-part="c5-beat-3" className={`hidden lg:block ${stack}`}>
        <h3 className="text-[clamp(1.25rem,1.1rem+0.8vw,1.625rem)] font-semibold leading-[1.2]">{meter.h3}</h3>
        <p className="mt-2 max-w-[44ch] text-base leading-[1.6] lg:text-[17px]">{meter.body}</p>
      </div>
      {/* Phones, in the pin: the meter label only. */}
      <div aria-hidden data-part="c5-beat-4" className="motion-only col-start-1 row-start-1 self-end lg:hidden">
        <p className="font-mono text-[12px] uppercase leading-relaxed tracking-[0.12em] text-[#7A3E1E]">{CH5.meterLabel}</p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#E9DCCB]">
          <div data-part="c5-minibar" className="h-full origin-left bg-[#A85D35]" style={{ transform: `scaleX(${meterReading('saturday').fraction})` }} />
        </div>
      </div>
    </div>
  );
}

export function Ch5() {
  const from = meterReading('baseline');
  const to = meterReading('saturday');
  const meter = {
    fromUsed: from.used,
    toUsed: to.used,
    fromFiles: String(from.files),
    toFiles: String(to.files),
    fromFill: Math.round(from.fraction * 10000) / 10000,
    toFill: Math.round(to.fraction * 10000) / 10000,
  };

  return (
    <section
      id="saturday"
      data-tone="gold"
      data-chapter="saturday"
      className="relative z-10 [overflow-x:clip] [html[data-motion='on']_&]:bg-[#161311]"
    >
      <StaticHorizon />
      <div className="relative [html:not([data-motion='on'])_&]:bg-[linear-gradient(180deg,#F7E7CF_0%,#F0C88E_38%,#E8A86E_72%,#D98A55_100%)]">
        <Ch5Stage className={`relative ${M.track}`} meter={meter}>
          <div
            data-part="c5-stage"
            className="relative m-0 [html[data-motion='on']_&]:sticky [html[data-motion='on']_&]:top-0 [html[data-motion='on']_&]:h-svh [html[data-motion='on']_&]:overflow-clip"
          >
            <Sky />
            <div className="motion-only">
              <TimeChip />
            </div>
            <div className="relative z-20 mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-12 lg:items-start lg:gap-12 lg:py-24 [html[data-motion='on']_&]:h-full [html[data-motion='on']_&]:py-0 max-lg:[html[data-motion='on']_&]:block max-lg:[html[data-motion='on']_&]:pt-[124px] lg:[html[data-motion='on']_&]:grid-rows-[minmax(0,1fr)] lg:[html[data-motion='on']_&]:items-center lg:[html[data-motion='on']_&]:pt-[64px]">
              <div className="lg:col-span-5 lg:sticky lg:top-24 [html[data-motion='on']_&]:static">
                <Copy />
              </div>
              <figure className="m-0 lg:col-span-7 max-lg:[html[data-motion='on']_&]:origin-top max-lg:[html[data-motion='on']_&]:scale-[0.86] lg:[html[data-motion='on']_&]:scale-[0.86] lg:[@media(max-height:820px)]:[html[data-motion='on']_&]:scale-[0.68]">
                <div aria-hidden>
                  <Album />
                  <div data-part="c5-row" className="relative z-20 hidden lg:block lg:-mt-14 lg:px-6 [html[data-motion='on']_&]:opacity-0">
                    <ActivityAndMeter />
                  </div>
                </div>
                <figcaption className="sr-only">{CH5.caption}</figcaption>
              </figure>
            </div>
          </div>
        </Ch5Stage>

        {/* Phones: the third beat and the meter, in normal flow after the pin. */}
        <div className="relative z-10 mx-auto max-w-6xl px-5 pb-6 sm:px-8 lg:hidden [html[data-motion='on']_&]:bg-[linear-gradient(180deg,#D98A55_0%,#F0C88E_100%)] [html[data-motion='on']_&]:pt-12">
          <div className={`rounded-3xl p-6 ${PAPER}`}>
            <h3 className="text-[clamp(1.25rem,1.1rem+0.8vw,1.625rem)] font-semibold leading-[1.2]">{CH5.beats[2].h3}</h3>
            <p className="mt-2 text-base leading-[1.6]">{CH5.beats[2].body}</p>
          </div>
          <div aria-hidden className="mt-8">
            <ActivityAndMeter />
          </div>
        </div>

        <div className="relative z-10 mx-auto max-w-6xl px-5 pb-16 pt-8 sm:px-8 [html[data-motion='on']_&]:bg-[#F0C88E] lg:[html[data-motion='on']_&]:bg-[#D98A55]">
          <p className={`max-w-[64ch] rounded-2xl px-4 py-3 text-[13px] leading-[1.55] ${PAPER}`}>{CH5.footnote}</p>
        </div>
      </div>
    </section>
  );
}
