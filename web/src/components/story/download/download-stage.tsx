import type { CSSProperties } from 'react';
import { NOTICES, TODAY } from '../data/strings/common';
import { DesktopWindow, desktopRadius, Slab } from '../frames';
import { AlbumGrid } from '../mocks/album-grid';
import { AlbumHeader } from '../mocks/album-header';
import { NotificationList, NotificationRow } from '../mocks/notification-row';
import { Float } from '../page/cinema/float';
import { GEAR_ASPECT, GearArt, type GearKind } from '../page/cinema/gear';
import { PhoneShell } from '../page/scenes/ch6-parts';

/**
 * The download page's stage (05-cinema.md §2, the same film grammar on a page
 * that does not scroll as a film): the desktop app hanging in 3D with a phone
 * in front of it, both floating, the tools of the trade drifting round them
 * on a warm key light. Rises in on load; at rest under reduced motion.
 * Decorative: the downloads themselves are the page's real content.
 *
 * Phones (under 640 px) have no room to layer: there the window stands alone,
 * the phone sits below it on the right, and only the camera and the lens float
 * in the space beside the phone. Nothing covers the window's content. From
 * 640 px the phone stands in front of the window, and the tools ring them both.
 */

type Piece = { kind: GearKind; className: string; h: number; delay: number; rot: number };

/**
 * Around the devices: % of the stage, h in px at desktop (scaled down on
 * phones). On phones only the camera and the lens show, in the free space
 * left of the phone below the window; the rest would land on a screen.
 */
const GEAR: Piece[] = [
  { kind: 'camera', className: 'bottom-[20%] left-[4%] sm:bottom-auto sm:left-[-6%] sm:top-[-4%]', h: 92, delay: 0.2, rot: -10 },
  { kind: 'light', className: 'hidden sm:block sm:left-[-13%] sm:top-[40%]', h: 120, delay: 2.1, rot: -4 },
  { kind: 'lens', className: 'bottom-[3%] left-[30%] sm:bottom-[-16%] sm:left-[34%]', h: 60, delay: 1.4, rot: 0 },
  { kind: 'timeline', className: 'hidden sm:block sm:right-[-4%] sm:top-[-10%]', h: 56, delay: 0.8, rot: 6 },
  { kind: 'brush', className: 'hidden sm:block sm:left-[44%] sm:top-[-16%]', h: 70, delay: 2.8, rot: 30 },
];

/** A few warm motes rising through the light. Positions are fixed so the page renders the same everywhere. */
const MOTES = [
  { x: '12%', y: '78%', s: 5, dur: 13, delay: -2, drift: '2vw', o: 0.6 },
  { x: '28%', y: '92%', s: 3, dur: 17, delay: -9, drift: '-1vw', o: 0.45 },
  { x: '47%', y: '84%', s: 7, dur: 15, delay: -5, drift: '3vw', o: 0.35 },
  { x: '63%', y: '96%', s: 4, dur: 12, delay: -11, drift: '-2vw', o: 0.55 },
  { x: '79%', y: '80%', s: 6, dur: 16, delay: -7, drift: '1vw', o: 0.4 },
  { x: '90%', y: '90%', s: 3, dur: 14, delay: -3, drift: '-3vw', o: 0.5 },
];

const rise = (delay: number) => ({ '--rise-delay': `${delay}s` }) as CSSProperties;

export function DownloadStage() {
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-[640px] [perspective:1400px]">
      {/* The key light the devices hang in. */}
      <div className="pointer-events-none absolute -inset-[18%] -z-10 rounded-full bg-[radial-gradient(closest-side,rgba(209,138,90,0.26),rgba(209,138,90,0.08)_55%,rgba(209,138,90,0)_100%)]" />

      {MOTES.map((m, i) => (
        <span
          key={i}
          className="story-mote autoplay pointer-events-none absolute rounded-full bg-[radial-gradient(circle,rgba(240,200,142,0.95),rgba(240,200,142,0)_70%)]"
          style={
            {
              left: m.x,
              top: m.y,
              width: m.s * 2,
              height: m.s * 2,
              '--mote-dur': `${m.dur}s`,
              '--mote-delay': `${m.delay}s`,
              '--mote-x': m.drift,
              '--mote-o': m.o,
            } as CSSProperties
          }
        />
      ))}

      {/* The desktop app: an album, delivered. */}
      <div className="story-rise" style={rise(0.35)}>
        <Float amp={7} tilt={1.4} duration={7.6}>
          <Slab rotateX={7} rotateY={-12} depth={14} radius={desktopRadius('windows')} edge="device" shadow="floor" className="w-full">
            <DesktopWindow os="windows" active="albums" className="h-[clamp(230px,58vw,330px)] lg:h-[clamp(280px,26vw,380px)]" contentClassName="overflow-hidden">
              <AlbumHeader platform="web" state="delivered" />
              <AlbumGrid platform="web" count={12} maxRows={2} heading={false} className="p-3" />
            </DesktopWindow>
          </Slab>
        </Float>
      </div>

      {/* The phone: the couple's picks, arriving. Phones: below the window, on the right. From 640 px: in front of it. */}
      <div
        className="story-rise relative ml-auto mr-[6%] mt-6 w-[42%] max-w-[170px] sm:absolute sm:-bottom-[18%] sm:right-[-6%] sm:mr-0 sm:mt-0 sm:w-[30%] sm:min-w-[118px] sm:max-w-[190px]"
        style={rise(0.7)}
      >
        <Float amp={6} tilt={1.8} duration={6.2} delay={2}>
          <PhoneShell time="4:58" night rotateY={-10}>
            <div className="pt-3">
              <NotificationList platform="phone" heading={TODAY}>
                <NotificationRow platform="phone" first {...NOTICES.picks} time="now" />
              </NotificationList>
            </div>
          </PhoneShell>
        </Float>
      </div>

      {GEAR.map((g, i) => (
        <div key={g.kind} className={`story-rise pointer-events-none absolute ${g.className}`} style={rise(0.9 + i * 0.12)}>
          <Float amp={8} tilt={2.4} duration={5.6 + i * 0.7} delay={g.delay}>
            <div
              className="relative scale-[0.62] sm:scale-100"
              style={{ height: g.h, width: Math.round(g.h * GEAR_ASPECT[g.kind]), rotate: `${g.rot}deg`, transformOrigin: 'center' }}
            >
              <div className="absolute -inset-[30%] rounded-full bg-[radial-gradient(closest-side,rgba(209,138,90,0.2),rgba(209,138,90,0))]" />
              <GearArt kind={g.kind} className="relative size-full drop-shadow-[0_16px_26px_rgba(0,0,0,0.6)]" />
            </div>
          </Float>
        </div>
      ))}

      <p className="absolute -bottom-7 left-0 font-mono text-[10.5px] uppercase tracking-[0.2em] text-[#A08E84] sm:-bottom-12">Illustrative</p>
    </div>
  );
}
