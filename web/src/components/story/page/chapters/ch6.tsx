import type { ReactNode } from 'react';
import { ALBUM } from '../../data/story';
import { NOTICES, TODAY } from '../../data/strings/common';
import { CH6_COPY, CH6_DEMO } from '../../data/strings/page-ch6';
import { BrowserFrame, BROWSER_RADIUS, PHONE_RADIUS, PhoneFrame, Slab } from '../../frames';
import { AlbumCard } from '../../mocks/album-card';
import { ClientGalleryPage, type ClientGalleryState } from '../../mocks/client-gallery';
import { NotificationList, NotificationRow } from '../../mocks/notification-row';
import { Plate } from '../../mocks/plate';
import { ShareDialog, type ShareDialogState } from '../../mocks/share-dialog';
import { LinkReadyAlert, ShareSheet, type ShareSheetState } from '../../mocks/share-sheet';
import { LinkStreak } from '../../svg';
import { Ch6Stage, HeartsDemo } from '../islands/ch6';

/**
 * Ch6 — The Handover · #delivery (storyboard §2 Ch6).
 *
 * Paper ground (the client page's own #FBF7F2), entered through a golden →
 * paper seam and left through a copy-free dusk breath into Ch7's night.
 *
 * Static first: the copy and three captioned key-frame panels are the page
 * for reduced motion and no JS. When the story moves, a sticky figure (the
 * owner's dialog or sheet, the link, the couple's phone) replaces the panels
 * and the island plays the beats from scroll.
 */

const H2 = 'max-w-[18ch] text-[clamp(2rem,1.3rem+3.4vw,4.25rem)] font-semibold leading-none tracking-[-0.03em]';
const H3 = 'text-[clamp(1.25rem,1.1rem+0.8vw,1.625rem)] font-semibold leading-[1.2] tracking-[-0.015em]';
const EYEBROW = 'font-mono text-xs uppercase tracking-[0.14em] text-[#7A3E1E] tabular-nums';
const BODY = 'max-w-[52ch] text-base leading-[1.6] text-[#3B322C] lg:text-[17px]';

/*
 * Layout only the moving story needs, keyed off <html data-motion>. The
 * transitions are on discrete flips (picks bar, rings), transform/opacity only.
 */
const CSS = `
#delivery [data-part="picks-bar"]{transition:opacity .32s cubic-bezier(.16,1,.3,1),transform .42s cubic-bezier(.16,1,.3,1)}
#delivery [data-part="picks-bar"]:not([data-on]){transform:translateY(18px)}
#delivery [data-part="tile-ring"]{transition:opacity .2s cubic-bezier(.2,0,0,1)}
html[data-motion='on'] #delivery .c6-figure{position:sticky;top:3.5rem;z-index:10;background:#FBF7F2}
html[data-motion='on'] #delivery .c6-beat{min-height:46svh;padding-top:2rem}
html[data-motion='on'] #delivery .c6-beat:first-child{min-height:40svh}
@media (min-width:1024px){
  html[data-motion='on'] #delivery .c6-track{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,7fr);column-gap:3.5rem}
  html[data-motion='on'] #delivery .c6-figure{grid-column:2;grid-row:1;top:0;height:100svh;background:transparent}
  html[data-motion='on'] #delivery .c6-copy{grid-column:1;grid-row:1}
  html[data-motion='on'] #delivery .c6-beat{min-height:72svh;padding-top:22svh}
  html[data-motion='on'] #delivery .c6-beat:first-child{min-height:64svh;padding-top:18svh}
  html:not([data-motion='on']) #delivery .c6-beat{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:center;column-gap:4rem}
}
`;

// ─── Pieces ──────────────────────────────────────────────────────────────

/** The owner's album behind the phone sheet: three across, 2 px gaps. */
function AlbumBackdrop({ from = 0 }: { from?: number }) {
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden bg-[#161311] pt-2">
      <div className="grid grid-cols-3 gap-[2px]">
        {Array.from({ length: 15 }, (_, i) => (
          <Plate key={i} seed={from + i} />
        ))}
      </div>
    </div>
  );
}

/** The web album page behind the dialog, under its overlay. */
function AlbumPageBackdrop() {
  return (
    <>
      <div aria-hidden className="absolute inset-0 grid grid-cols-4 content-start gap-1.5 p-4 opacity-60">
        {Array.from({ length: 12 }, (_, i) => (
          <Plate key={i} seed={i + 3} className="rounded-md" />
        ))}
      </div>
      <div aria-hidden className="absolute inset-0 bg-black/30" />
    </>
  );
}

/** The owner's web dialog in its browser window, on a card slab. */
function DialogSlab({ state, rotateY = 8, className = '' }: { state: ShareDialogState; rotateY?: number; className?: string }) {
  return (
    <Slab className={`w-full ${className}`} rotateX={4} rotateY={rotateY} depth={10} radius={BROWSER_RADIUS} edge="card">
      <BrowserFrame url="web.virgo.ph/albums/8c1f…" viewportClassName="h-[600px] overflow-hidden sm:h-[500px]">
        <AlbumPageBackdrop />
        <div className="absolute inset-0 flex items-center justify-center p-3 sm:p-4">
          <ShareDialog state={state} />
        </div>
      </BrowserFrame>
    </Slab>
  );
}

/** The couple's phone, light, on a device slab. */
function CouplePhone({
  state,
  rotateY = -8,
  time = '4:52',
  className = 'w-[min(100%,340px)]',
}: {
  state: ClientGalleryState;
  rotateY?: number;
  time?: string;
  className?: string;
}) {
  return (
    <Slab className={className} rotateX={4} rotateY={rotateY} depth={14} radius={PHONE_RADIUS} edge="device" shadow="floor">
      <PhoneFrame width="100%" time={time} tone="dark" screen="#FBF7F2" wifi>
        <ClientGalleryPage className="absolute inset-0" state={state} tiles={8} browserBar />
      </PhoneFrame>
    </Slab>
  );
}

/** The address, in large mono type. */
function LinkLine({ className = '' }: { className?: string }) {
  return (
    <p aria-hidden className={`whitespace-nowrap font-mono font-medium tracking-[-0.02em] text-[#1E1B18] ${className}`}>
      {ALBUM.linkPath}
    </p>
  );
}

/** "Same link": a bracket under the unchanged address. */
function SameLink({ className = '' }: { className?: string }) {
  return (
    <div aria-hidden className={`inline-flex flex-col items-stretch ${className}`}>
      <LinkLine className="text-[15px] sm:text-[17px]" />
      <span className="mt-1.5 h-2.5 rounded-b-md border-x-[1.5px] border-b-[1.5px] border-[#A85D35]" />
      <span className="mt-1.5 self-center font-mono text-[11px] uppercase tracking-[0.14em] text-[#7A3E1E]">{CH6_COPY.sameLink}</span>
    </div>
  );
}

function Panel({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <figure className="static-only mt-10 lg:mt-0">
      <div className="flex flex-col items-center gap-8 [overflow-x:clip] py-4">{children}</div>
      <figcaption className="mx-auto mt-6 max-w-[44ch] text-center text-sm leading-relaxed text-[#54433C]">{caption}</figcaption>
    </figure>
  );
}

// ─── The moving figure ───────────────────────────────────────────────────

const LAYER = 'absolute inset-0 will-change-[opacity]';

function SheetLayer({ part, state, from }: { part: string; state: ShareSheetState; from: number }) {
  return (
    <div className={LAYER} data-part={part}>
      <AlbumBackdrop from={from} />
      <div className="absolute inset-0" data-part={part === 'm6-owner' ? 'm6-sheet' : 'm6-sheet-later'}>
        <ShareSheet state={state} />
      </div>
    </div>
  );
}

function MobileFigure() {
  return (
    <div className="relative mx-auto w-full max-w-[420px] px-1 pb-3 pt-2 lg:hidden">
      <div data-part="m6-phone">
        <Slab className="w-full" rotateX={3} rotateY={-6} depth={12} radius={PHONE_RADIUS} edge="device" shadow={false}>
          <PhoneFrame width="100%" ratio={0} time="4:50" tone="dark" screen="#FBF7F2" wifi>
            <div className="relative h-[calc(56svh-4.75rem)] min-h-[300px] overflow-hidden">
              <SheetLayer part="m6-owner" state="scoped" from={0} />
              <div className={LAYER} data-part="m6-alert" style={{ opacity: 0 }}>
                <LinkReadyAlert />
              </div>
              <div className={LAYER} data-part="m6-sunday" data-c6-layer="sunday">
                <ClientGalleryPage className="absolute inset-0" state="sent" tiles={6} browserBar />
              </div>
              <SheetLayer part="m6-owner-later" state="rescoped" from={6} />
              <div className={LAYER} data-part="m6-alert-later" style={{ opacity: 0 }}>
                <LinkReadyAlert />
              </div>
              <div className={LAYER} data-part="m6-later" data-c6-layer="later">
                <ClientGalleryPage className="absolute inset-0" state="rescoped" tiles={6} browserBar />
              </div>
              <div className="pointer-events-none absolute inset-x-3 top-14 z-40" data-part="m6-notice" style={{ opacity: 0 }}>
                <div className="overflow-hidden rounded-[18px] bg-[#1E1B18] shadow-[0_18px_40px_-18px_rgba(0,0,0,0.6)]">
                  <NotificationList platform="phone">
                    <NotificationRow platform="phone" first {...NOTICES.picks} time="now" />
                  </NotificationList>
                </div>
              </div>
            </div>
          </PhoneFrame>
        </Slab>
      </div>
      {/* The link, rising out of the alert, and its streak. */}
      <div className="pointer-events-none absolute inset-x-0 top-[38%] z-20 flex justify-center" data-part="m6-url" style={{ opacity: 0 }}>
        <span className="rounded-full bg-[#FBF7F2] px-4 py-2 shadow-[0_12px_30px_-12px_rgba(62,39,26,0.45)]">
          <LinkLine className="text-[18px]" />
        </span>
      </div>
      <div className="pointer-events-none absolute inset-x-[10%] top-[18%] z-20" data-part="m6-streak" style={{ opacity: 0 }}>
        <LinkStreak />
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-4 z-30 flex justify-center">
        <p
          data-part="m6-later-chip"
          className="whitespace-nowrap rounded-full bg-[#1E1B18] px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-[#F7E7CF] shadow-lg"
          style={{ opacity: 0 }}
        >
          {CH6_COPY.laterEyebrow}
        </p>
      </div>
    </div>
  );
}

function DesktopFigure() {
  return (
    <div className="hidden h-full items-center pt-16 lg:flex">
      <div className="relative h-[min(80svh,740px)] w-full [perspective:1200px] [perspective-origin:50%_40%]">
        <p data-part="c6-titlecard" aria-hidden className={`${EYEBROW} absolute -top-8 left-0 text-sm`} style={{ opacity: 0 }}>
          {CH6_COPY.titleCard}
        </p>
        <p
          data-part="c6-later-chip"
          aria-hidden
          className="absolute -top-8 left-0 z-30 rounded-full bg-[#1E1B18] px-3.5 py-1.5 font-mono text-xs uppercase tracking-[0.14em] text-[#F7E7CF]"
          style={{ opacity: 0 }}
        >
          {CH6_COPY.laterEyebrow}
        </p>

        <div data-part="c6-fold" className="absolute left-[18%] top-[22%] w-[300px] origin-bottom" style={{ opacity: 0 }}>
          <AlbumCard platform="web" state="draft" />
        </div>

        <div data-part="c6-owner" className="absolute left-0 top-[10%] w-[min(66%,500px)]">
          <div data-part="c6-dialog">
            <DialogSlab state="updated" rotateY={0} />
          </div>
        </div>

        <div data-part="c6-url" className="pointer-events-none absolute inset-x-0 top-[2%] z-20 flex justify-center" style={{ opacity: 0 }}>
          <LinkLine className="text-[clamp(1.5rem,2.4vw,2.4rem)]" />
        </div>
        <div data-part="c6-same" className="pointer-events-none absolute left-[4%] top-[1%] z-20" style={{ opacity: 0 }}>
          <SameLink />
        </div>

        <div data-part="c6-streak" className="pointer-events-none absolute left-[18%] top-[22%] z-20 w-[62%]" style={{ opacity: 0 }}>
          <LinkStreak />
        </div>

        <div data-part="c6-couple" className="absolute left-1/2 top-[3%] z-10 -ml-[150px] w-[300px]">
          <Slab className="w-full" rotateX={2} rotateY={-6} depth={14} radius={PHONE_RADIUS} edge="device" shadow="floor">
            <PhoneFrame width="100%" time="4:52" tone="dark" screen="#FBF7F2" wifi>
              <div className={LAYER} data-c6-layer="sunday">
                <ClientGalleryPage className="absolute inset-0" state="sent" tiles={8} browserBar />
              </div>
              <div className={LAYER} data-part="c6-later" data-c6-layer="later">
                <ClientGalleryPage className="absolute inset-0" state="rescoped" tiles={8} browserBar />
              </div>
            </PhoneFrame>
          </Slab>
        </div>

        <div data-part="c6-notice" className="absolute left-0 top-[44%] z-30 w-[360px]" style={{ opacity: 0 }}>
          <div className="shadow-[0_30px_60px_-28px_rgba(30,20,14,0.55)]">
            <NotificationList platform="web" heading={TODAY}>
              <NotificationRow platform="web" {...NOTICES.picks} />
            </NotificationList>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── The chapter ─────────────────────────────────────────────────────────

const DEMO_SEEDS = [41, 57, 12, 88, 23, 70];

export function Ch6() {
  return (
    <section
      id="delivery"
      data-tone="day"
      data-chapter="delivery"
      aria-labelledby="ch6-title"
      className="relative z-10 bg-[#FBF7F2] text-[#1E1B18] [overflow-x:clip]"
    >
      <style>{CSS}</style>
      {/* Golden → paper: Saturday's light lands on the client page's paper. */}
      <div aria-hidden className="h-28 bg-[linear-gradient(180deg,#D98A55_0%,#E8A86E_18%,#F0C88E_42%,#F7E7CF_70%,#FBF7F2_100%)] sm:h-40" />

      <Ch6Stage className="c6-track relative mx-auto max-w-[1240px] px-4 sm:px-8">
        <figure aria-labelledby="ch6-caption" className="c6-figure motion-only -mx-4 sm:mx-0">
          <MobileFigure />
          <DesktopFigure />
          <figcaption id="ch6-caption" className="sr-only">
            {CH6_COPY.caption}
          </figcaption>
        </figure>

        <div className="c6-copy">
          <div className="c6-beat">
            <div>
              <p className={EYEBROW}>
                {CH6_COPY.eyebrowN} · <time dateTime="2026-12-13T16:50">{CH6_COPY.titleCard}</time> · {CH6_COPY.eyebrowPlace}
              </p>
              <h2 id="ch6-title" className={`${H2} mt-4`}>
                {CH6_COPY.title}
              </h2>
              <p className={`${BODY} mt-6`}>{CH6_COPY.body}</p>
              <p className="mt-5 font-mono text-sm uppercase tracking-[0.1em] text-[#7A3E1E]">{CH6_COPY.line}</p>
            </div>
            <Panel caption={CH6_COPY.panels[0]}>
              <DialogSlab state="generated" rotateY={-6} className="max-w-[460px]" />
            </Panel>
          </div>

          <div className="c6-beat">
            <div>
              <h3 className={H3}>{CH6_COPY.picksTitle}</h3>
              <p className={`${BODY} mt-4`}>{CH6_COPY.picksBody}</p>
            </div>
            <Panel caption={CH6_COPY.panels[1]}>
              <CouplePhone state="sent" rotateY={-7} />
              <Slab className="w-full max-w-[400px]" rotateX={6} rotateY={5} depth={8} radius="rounded-xl" edge="card">
                <NotificationList platform="web" heading={TODAY}>
                  <NotificationRow platform="web" {...NOTICES.picks} />
                </NotificationList>
              </Slab>
            </Panel>
          </div>

          <div className="c6-beat">
            <div>
              <p className={EYEBROW}>{CH6_COPY.laterEyebrow}</p>
              <h3 className={`${H3} mt-3`}>{CH6_COPY.laterTitle}</h3>
              <p className={`${BODY} mt-4`}>{CH6_COPY.laterBody}</p>
            </div>
            <Panel caption={CH6_COPY.panels[2]}>
              <SameLink />
              <DialogSlab state="updated" rotateY={6} className="max-w-[460px]" />
              <CouplePhone state="rescoped" rotateY={7} time="11:00" />
            </Panel>
          </div>
        </div>
      </Ch6Stage>

      {/* Try the hearts: in normal flow, a working copy, no network. */}
      <div className="relative mx-auto max-w-[1240px] px-4 pb-16 pt-20 sm:px-8 lg:pt-28">
        <div className="rounded-[28px] border border-[#DED3CA] bg-[#F6F0E8] px-4 py-8 sm:px-8 sm:py-10 lg:grid lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-12">
          <div>
            <h3 className={H3}>{CH6_DEMO.title}</h3>
            <p className={`${BODY} mt-3`}>{CH6_DEMO.intro}</p>
          </div>
          <HeartsDemo plates={DEMO_SEEDS.map((seed) => <Plate key={seed} seed={seed} aspect="4:5" variant="full" />)} />
        </div>
        <p className="mt-8 text-[13px] leading-relaxed text-[#6F5C52]">{CH6_COPY.footnote}</p>
      </div>

      {/* The dusk breath: paper through dusk to night, no copy. Tiles become points of light. */}
      <div
        aria-hidden
        className="relative h-[30svh] bg-[linear-gradient(180deg,#FBF7F2_0%,#F7E7CF_14%,#F0C88E_28%,#D98A55_42%,#6B3E25_60%,#2A1E18_80%,#161311_100%)] lg:h-[40svh]"
      >
        {[
          [12, 78, 1.5],
          [27, 88, 1],
          [41, 72, 1.5],
          [58, 90, 1],
          [69, 80, 2],
          [83, 86, 1],
          [92, 74, 1.5],
        ].map(([x, y, s]) => (
          <span
            key={`${x}-${y}`}
            className="absolute rounded-full bg-[#F7E7CF]"
            style={{ left: `${x}%`, top: `${y}%`, width: s * 2, height: s * 2, boxShadow: '0 0 8px 2px rgba(247,231,207,0.35)' }}
          />
        ))}
      </div>
    </section>
  );
}
