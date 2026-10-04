import { CLEANUPS } from '../../data/strings/ch7';
import { TODAY } from '../../data/strings/common';
import { CH7_COPY } from '../../data/strings/page-ch7';
import { Slab } from '../../frames';
import { AlbumCard } from '../../mocks/album-card';
import { ClientGalleryPage } from '../../mocks/client-gallery';
import { DayRuler } from '../../mocks/day-ruler';
import { NotificationList, NotificationRow } from '../../mocks/notification-row';
import { Plate } from '../../mocks/plate';
import { RetentionField } from '../../mocks/retention-field';
import { StorageMeter, meterReading, type StorageMeterState } from '../../mocks/storage-meter';
import { Ch7Stage, type MeterStep } from '../islands/ch7';

/**
 * Ch7 — Forget · #forget (storyboard §2 Ch7).
 *
 * Night again. Static first: an annotated timeline with each sweep's notice,
 * a before/after meter and the emptied album are the reduced-motion and no-JS
 * page. When the story moves, a sticky figure scrubs Day 0 → Day 112: the
 * ruler's playhead, the counter, tiles dissolving into rising motes at
 * Day 91, the notices, the meter draining to 307 MB, then the empty album.
 */

const H2 = 'max-w-[18ch] text-[clamp(2rem,1.3rem+3.4vw,4.25rem)] font-semibold leading-none tracking-[-0.03em]';
const EYEBROW = 'font-mono text-xs uppercase tracking-[0.14em] text-[#D18A5A] tabular-nums';
const BODY = 'max-w-[52ch] text-base leading-[1.6] text-[#BCADA3] lg:text-[17px]';

const CSS = `
html[data-motion='on'] #forget .c7-figure{position:sticky;top:3.5rem;z-index:10;background:#161311}
html[data-motion='on'] #forget .c7-track{min-height:140svh}
html[data-motion='on'] #forget .c7-beat{min-height:44svh;padding-top:2rem}
@media (min-width:1024px){
  html[data-motion='on'] #forget .c7-track{min-height:160svh;display:grid;grid-template-columns:minmax(0,5fr) minmax(0,7fr);column-gap:3.5rem}
  html[data-motion='on'] #forget .c7-figure{grid-column:2;grid-row:1;top:0;height:100svh;background:transparent}
  html[data-motion='on'] #forget .c7-copy{grid-column:1;grid-row:1}
  html[data-motion='on'] #forget .c7-beat{min-height:70svh;padding-top:24svh}
}
`;

/** Saturday's frames on the grid: 6 on a phone, 12 from lg. */
const TILE_SEEDS = [3, 17, 29, 44, 8, 61, 72, 35, 90, 13, 51, 26];
/** Six motes per tile (≤ 36 on a phone, ≤ 72 from lg): offsets in px, seeded, fixed. */
const MOTES = TILE_SEEDS.flatMap((seed, tile) =>
  Array.from({ length: 6 }, (_, k) => {
    const h = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
    const u = h - Math.floor(h);
    const v = (u * 7.31) % 1;
    return {
      tile,
      x: 20 + Math.round(u * 60),
      y: 20 + Math.round(v * 60),
      dx: Math.round((v - 0.5) * 70),
      rise: 110 + Math.round(u * 160),
      z: 60 + Math.round(v * 140),
      size: k % 3 === 0 ? 3 : 2,
    };
  }),
);

const READ_STATES: StorageMeterState[] = ['beforeCleanUp', 'day91', 'day92', 'day112'];

function meterSteps(): [MeterStep, MeterStep, MeterStep, MeterStep] {
  const [a, b, c, d] = READ_STATES.map((s) => {
    const m = meterReading(s);
    return { used: m.used, left: m.left, files: m.files, fraction: m.fraction, percent: m.percent };
  });
  return [a, b, c, d];
}

/** The emptied client link: the page at a phone's size, drawn small. */
function ClientMini({ className = '' }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-[20px] ring-1 ring-[rgba(242,237,232,0.14)] ${className}`}>
      <div className="absolute left-0 top-0 h-[560px] w-[375px] origin-top-left scale-[0.45] lg:scale-[0.6]">
        <ClientGalleryPage className="absolute inset-0" state="empty" browserBar />
      </div>
    </div>
  );
}
const MINI_SIZE = 'h-[252px] w-[169px] lg:h-[336px] lg:w-[225px]';

function Notice({ i, compact = false }: { i: number; compact?: boolean }) {
  const c = CLEANUPS[i];
  return (
    <NotificationList platform="web" heading={compact ? undefined : TODAY}>
      <NotificationRow platform="web" topic={c.topic} title={c.title} body={c.body} time={c.time} />
    </NotificationList>
  );
}

function MovingFigure() {
  return (
    <div className="flex h-full items-start justify-center pb-3 pt-2 lg:items-center lg:pt-16">
      <div className="relative w-full max-w-[720px] [perspective:900px] lg:[perspective:1200px]">
        {/* Row 1: the flashback, and Mika's meter. */}
        <div className="relative grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-5">
          <div data-part="c7-flash" className="absolute inset-x-0 top-0 z-20 lg:static">
            <div className="rounded-2xl border border-[#362F2B] bg-[#1E1B18] p-4 shadow-[0_24px_50px_-24px_rgba(0,0,0,0.8)]">
              <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.14em] text-[#D18A5A]">{CH7_COPY.flashback}</p>
              <RetentionField state="chosen" />
            </div>
          </div>
          <div data-part="c7-meter" className="lg:col-start-2">
            <StorageMeter platform="phone" state="beforeCleanUp" className="lg:hidden" />
            <StorageMeter platform="web" state="beforeCleanUp" className="hidden lg:block [&>div]:py-3" />
          </div>
        </div>

        {/* Row 2 and 3: the ruler, and what it takes. */}
        <div className="relative mt-3 lg:mt-5">
          <div data-part="c7-ruler">
            <Slab className="w-full" rotateX={7} depth={8} radius="rounded-2xl" edge="card" shadow={false}>
              <div className="bg-[#161311] p-4 lg:p-6">
                <DayRuler state="start" />
              </div>
            </Slab>
          </div>

          <div className="relative mt-3 h-[92px] lg:mt-5 lg:h-[250px]">
            <div data-part="c7-tiles" className="grid h-full grid-cols-6 gap-1.5 lg:grid-cols-4 lg:grid-rows-3 lg:gap-2">
              {TILE_SEEDS.map((seed, i) => (
                <div key={seed} className={`relative ${i >= 6 ? 'hidden lg:block' : ''}`}>
                  <div data-part="c7-tile" className="absolute inset-0 overflow-hidden rounded-lg">
                    <Plate seed={seed} aspect="fill" />
                  </div>
                  {MOTES.filter((m) => m.tile === i).map((m, k) => (
                    <span
                      key={k}
                      data-part="c7-mote"
                      data-tile={m.tile}
                      data-dx={m.dx}
                      data-rise={m.rise}
                      data-z={m.z}
                      className="pointer-events-none absolute rounded-full bg-[#FFF4E4] shadow-[0_0_8px_2px_rgba(247,217,176,0.55)]"
                      style={{ left: `${m.x}%`, top: `${m.y}%`, width: m.size, height: m.size, opacity: 0 }}
                    />
                  ))}
                </div>
              ))}
            </div>

            {/* The notices: each arrives after its sweep. Day 92 is one line on a phone. */}
            <div className="absolute inset-0 flex flex-col justify-center gap-2 lg:justify-start lg:gap-3">
              <div data-part="c7-notice" style={{ opacity: 0 }} className="absolute inset-x-0 top-0 lg:static">
                <Notice i={0} compact />
              </div>
              <div data-part="c7-notice" style={{ opacity: 0 }} className="absolute inset-x-0 top-0 lg:static">
                <p className="rounded-xl border border-[#362F2B] bg-[#1E1B18] px-4 py-3 text-[13px] leading-snug text-[#F2EDE8] lg:hidden">
                  {CLEANUPS[1].body}
                </p>
                <div className="hidden lg:block">
                  <Notice i={1} compact />
                </div>
              </div>
              <div data-part="c7-notice" style={{ opacity: 0 }} className="absolute inset-x-0 top-0 lg:static">
                <Notice i={2} compact />
              </div>
            </div>
          </div>

          {/* The end: the album stays, emptied; the link has nothing to show. */}
          <div data-part="c7-end" className="absolute inset-0 z-20 flex items-center justify-center gap-3 lg:gap-6" style={{ opacity: 0 }}>
            <Slab className="w-[140px] lg:w-[260px]" rotateX={8} rotateY={8} depth={8} radius="rounded-xl" edge="card">
              <AlbumCard platform="web" state="empty" />
            </Slab>
            <Slab className={MINI_SIZE} rotateX={6} rotateY={-8} depth={8} radius="rounded-[20px]" edge="device">
              <ClientMini className={MINI_SIZE} />
            </Slab>
          </div>
        </div>
      </div>
    </div>
  );
}

function StaticFigure() {
  return (
    <figure className="static-only mt-12">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-14">
        {/* The annotated timeline: vertical on a phone, the ruler from lg, each sweep with its notice. */}
        <div>
          <div className="lg:hidden">
            <Slab className="w-full" rotateX={6} depth={8} radius="rounded-2xl" edge="card">
              <div className="bg-[#161311] p-5">
                <DayRuler orientation="vertical" />
              </div>
            </Slab>
          </div>
          <div className="hidden lg:block">
            <Slab className="w-full" rotateX={8} depth={8} radius="rounded-2xl" edge="card">
              <div className="bg-[#161311] p-6">
                <DayRuler state="overview" />
              </div>
            </Slab>
            <ol className="mt-8 grid gap-3">
              {CLEANUPS.map((c, i) => (
                <li key={c.id}>
                  <Notice i={i} />
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="grid content-start gap-8">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <div>
              <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[#A08E84]">{CH7_COPY.before}</p>
              <StorageMeter platform="web" state="beforeCleanUp" />
            </div>
            <div>
              <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[#A08E84]">{CH7_COPY.after}</p>
              <StorageMeter platform="web" state="day112" />
            </div>
          </div>
          <div className="flex items-center justify-center gap-4">
            <Slab className="w-[150px] sm:w-[220px]" rotateX={8} rotateY={8} depth={8} radius="rounded-xl" edge="card">
              <AlbumCard platform="web" state="empty" />
            </Slab>
            <Slab className={MINI_SIZE} rotateX={6} rotateY={-8} depth={8} radius="rounded-[20px]" edge="device">
              <ClientMini className={MINI_SIZE} />
            </Slab>
          </div>
        </div>
      </div>
      <figcaption className="mt-8 max-w-[64ch] text-sm leading-relaxed text-[#A08E84]">{CH7_COPY.caption}</figcaption>
    </figure>
  );
}

export function Ch7() {
  return (
    <section
      id="forget"
      data-tone="night"
      data-chapter="forget"
      aria-labelledby="ch7-title"
      className="relative z-10 bg-[linear-gradient(180deg,#161311_0%,#161311_88%,rgba(22,19,17,0)_100%)] text-[#F2EDE8] [overflow-x:clip]"
    >
      <style>{CSS}</style>
      <Ch7Stage meter={meterSteps()} className="c7-track relative mx-auto max-w-[1240px] px-4 pt-16 sm:px-8 lg:pt-8">
        <figure aria-labelledby="ch7-caption" className="c7-figure motion-only">
          <MovingFigure />
          <figcaption id="ch7-caption" className="sr-only">
            {CH7_COPY.caption}
          </figcaption>
        </figure>

        <div className="c7-copy">
          <div className="c7-beat">
            <p className={EYEBROW}>{CH7_COPY.eyebrow}</p>
            <h2 id="ch7-title" className={`${H2} mt-4`}>
              {CH7_COPY.title}
            </h2>
            <p className={`${BODY} mt-6`}>{CH7_COPY.body}</p>
          </div>
          <div className="c7-beat">
            <p className="max-w-[52ch] text-base leading-[1.6] text-[#F2EDE8] lg:text-[17px]">{CH7_COPY.step}</p>
            <p className="mt-5 max-w-[52ch] text-sm leading-relaxed text-[#A08E84]">{CH7_COPY.small}</p>
            <p className="mt-8 text-[13px] leading-relaxed text-[#A08E84]">{CH7_COPY.footnote}</p>
          </div>
        </div>
      </Ch7Stage>

      <div className="mx-auto max-w-[1240px] px-4 pb-28 sm:px-8">
        <StaticFigure />
      </div>
    </section>
  );
}
