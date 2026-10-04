'use client';

import { m, useMotionValueEvent, useTransform, type MotionValue } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { ALBUM } from '../../data/story';
import { NOTICES, TODAY } from '../../data/strings/common';
import { CH6 } from '../../data/strings/page-ch6';
import { ClientGalleryPage } from '../../mocks/client-gallery';
import { NotificationList, NotificationRow } from '../../mocks/notification-row';
import { camera, lerp, r2, seg, window4 } from '../cinema/ease';
import { LightSweep, useCamera, useReveal } from '../cinema/fx';
import { Float } from '../cinema/float';
import { Morph } from '../cinema/morph';
import { Illustrative, Shot, Slate, Subtitles, type Line } from '../cinema/shot';
import { CH6_LENGTH, LinkCard, PhoneShell } from './ch6-parts';

/**
 * Ch6 · The Handover, the film (05-cinema.md §3 and the brief's addenda).
 * One shot on the client page's paper. The iris into it, and the tunnel out
 * to Ch7, are drawn centrally (cinema/cuts.tsx); the shot opens as a zoom in.
 *
 *   0.00–0.22  zoom in on the link, a card turning in the afternoon light;
 *              a gold rule draws under its address; a light sweep
 *   0.24–0.38  the camera pushes through the card onto the couple's phone
 *   0.38–0.50  they heart their picks, the picks bar rises, Send at 0.50
 *   0.50–0.62  the heart flies to Mika's phone and becomes its dot (a morph);
 *              the notification lands with a rumble at 0.56
 *   0.62–0.76  slate change, THREE WEEKS LATER: a sweep of light, the same
 *              page now opens on its films
 *   0.74–1.00  the same address, ruled in gold, holds as the camera pushes in
 *
 * Compositor-only, except the mock's own data-attribute flips on the beats.
 * No React state per frame.
 */

const SLATES: readonly Line[] = [
  { text: CH6.slate, from: 0, to: 0.65 },
  { text: CH6.slateLater, from: 0.67, to: 1.02 },
];

const LINES: readonly Line[] = [
  { text: CH6.title, from: 0.04, to: 0.3 },
  { text: CH6.picks, from: 0.38, to: 0.64 },
  { text: CH6.later, from: 0.72, to: 0.99 },
];

const PICKED = 0.4;
const SENT = 0.5;
const TOLD = 0.56;

export function Ch6Scene() {
  return (
    <Shot length={CH6_LENGTH} className="bg-[#FBF7F2] text-[#1E1B18]">
      {(progress) => <Stage progress={progress} />}
    </Shot>
  );
}

function Stage({ progress }: { progress: MotionValue<number> }) {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_70%_at_82%_8%,rgba(240,200,142,0.5),rgba(251,247,242,0)_62%),linear-gradient(180deg,#FBF7F2_0%,#F7EEE2_100%)]"
      />
      <LightSweep progress={progress} from={0.08} to={0.3} />
      <Card progress={progress} />
      <Couple progress={progress} />
      <Mika progress={progress} />
      <HeartToDot progress={progress} />
      <SameLink progress={progress} />
      <LightSweep progress={progress} from={0.62} to={0.78} />
      <Slate progress={progress} slates={SLATES} tone="day" />
      <Subtitles progress={progress} lines={LINES} tone="day" />
      <Illustrative tone="day" />
    </>
  );
}

// ─── The link ────────────────────────────────────────────────────────────

function Card({ progress }: { progress: MotionValue<number> }) {
  // The zoom in, a turn in the light, then the push through.
  const cam = useCamera(progress, [
    { at: 0, scale: 0.55, y: 6, rx: 14, ry: -24 },
    { at: 0.2, scale: 1, y: 0, rx: 5, ry: -6 },
    { at: 0.26, scale: 1.04, y: 0, rx: 3, ry: 2 },
    { at: 0.36, scale: 2.6, y: -2, rx: 0, ry: 0 },
  ]);
  const reveal = useReveal(progress, 0.0, 0.08, 0.29, 0.36, { y: 30, scale: 0.92 });
  const rule = useTransform(progress, (p) => `scaleX(${r2(camera(seg(p, 0.1, 0.2)))})`);
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-[17svh] z-10 flex justify-center lg:top-[19svh]">
      <m.div style={{ transform: cam }} className="w-[min(78vw,340px)] lg:w-[400px]">
        <m.div style={reveal} className="shadow-[0_40px_70px_-34px_rgba(62,39,26,0.55)]">
          <Float amp={7} tilt={2} duration={6.6}>
            <LinkCard rule={<m.span style={{ transform: rule }} className="absolute inset-x-1 -bottom-2 h-px origin-left bg-[#C17745]" />} />
          </Float>
        </m.div>
      </m.div>
    </div>
  );
}

/** The same address, three weeks later, ruled in gold. */
function SameLink({ progress }: { progress: MotionValue<number> }) {
  const reveal = useReveal(progress, 0.74, 0.8, 1.1, 1.2, { y: 18, scale: 0.92 });
  const rule = useTransform(progress, (p) => `scaleX(${r2(camera(seg(p, 0.78, 0.86)))})`);
  return (
    <m.div aria-hidden style={reveal} className="pointer-events-none absolute inset-x-0 top-[60svh] z-20 flex justify-center lg:top-[63svh]">
      <div className="relative">
        <p className="rounded-full bg-white px-4 py-2 font-mono text-[15px] text-[#7A3E1E] shadow-[0_14px_34px_-14px_rgba(62,39,26,0.5)] ring-1 ring-[rgba(122,62,30,0.14)]">
          {ALBUM.linkPath}
        </p>
        <m.span style={{ transform: rule }} className="absolute inset-x-2 -bottom-2 h-px origin-left bg-[#C17745]" />
      </div>
    </m.div>
  );
}

// ─── The couple's phone ──────────────────────────────────────────────────

/** Where the couple's phone steps aside while Mika's is on screen (vw). */
const aside = (p: number) => camera(seg(p, 0.46, 0.52)) * (1 - camera(seg(p, 0.63, 0.69)));

function Couple({ progress }: { progress: MotionValue<number> }) {
  const shift = useTransform(progress, (p) => `translate3d(${r2(-aside(p) * (window.innerWidth >= 1024 ? 13 : 12))}vw,0,0)`);
  const cam = useCamera(progress, [
    { at: 0.26, scale: 0.8, y: 6, rx: 8, ry: 18 },
    { at: 0.4, scale: 1, rx: 3, ry: -6 },
    { at: 0.62, scale: 1, rx: 2, ry: 8 },
    { at: 0.74, scale: 1.02, rx: 4, ry: -8 },
    { at: 1, scale: 1.08, y: -1, rx: 2, ry: 4 },
  ]);
  const reveal = useReveal(progress, 0.28, 0.38, 1.1, 1.2, { y: 40, scale: 0.9 });
  const later = useTransform(progress, (p) => r2(camera(seg(p, 0.68, 0.74))));
  const root = useRef<HTMLDivElement>(null);
  usePicks(progress, root);
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-[12svh] z-10 flex justify-center lg:top-[9svh]">
      <m.div style={{ transform: shift }}>
        <m.div style={{ transform: cam }}>
          <m.div ref={root} style={reveal} className="w-[min(62vw,28svh)] lg:w-[min(290px,30svh)]">
            <Float amp={6} tilt={1.6} duration={6.8} delay={1.2}>
              <PhoneShell time="4:52">
                <div className="absolute inset-0" data-c6="sunday">
                  <ClientGalleryPage className="absolute inset-0" state="sent" tiles={8} browserBar />
                </div>
                <m.div style={{ opacity: later }} className="absolute inset-0" data-c6="later">
                  <ClientGalleryPage className="absolute inset-0" state="rescoped" kind="video" tiles={6} browserBar />
                </m.div>
              </PhoneShell>
            </Float>
          </m.div>
        </m.div>
      </m.div>
    </div>
  );
}

const on = (el: Element | null | undefined, attr: string, yes: boolean) => {
  if (!el) return;
  if (yes) el.setAttribute(attr, '');
  else el.removeAttribute(attr);
};

/**
 * The couple's picks, played on the mock's own attributes: hearts fill one by
 * one from PICKED, the picks bar rises, Send flips at SENT. Attributes change
 * only on a beat; the page's scroll is a transform per frame.
 */
function usePicks(progress: MotionValue<number>, root: React.RefObject<HTMLDivElement | null>) {
  const els = useRef<{
    hearts: Element[];
    tiles: Element[];
    bar: Element | null;
    mine: Element | null;
    send: Element | null;
    note: Element | null;
    scroll: HTMLElement | null;
  } | null>(null);
  const step = useRef(-1);
  const scrolled = useRef('');

  const apply = (p: number) => {
    const e = els.current;
    if (!e) return;
    const y = `translate3d(0,${r2(-230 * camera(seg(p, 0.32, 0.4)))}px,0)`;
    if (e.scroll && y !== scrolled.current) {
      scrolled.current = y;
      e.scroll.style.transform = y;
    }
    const n = p < PICKED ? 0 : Math.min(e.hearts.length, 1 + Math.floor((p - PICKED) / 0.03));
    const next = n * 2 + (p >= SENT ? 1 : 0);
    if (next === step.current) return;
    step.current = next;
    e.hearts.forEach((h, i) => on(h, 'data-on', i < n));
    e.tiles.forEach((t, i) => on(t, 'data-picked', i < n));
    on(e.bar, 'data-on', n > 0);
    e.mine?.setAttribute('data-state', n > 0 ? 'some' : 'none');
    e.send?.setAttribute('data-state', p >= SENT ? 'sent' : 'unsent');
    on(e.note, 'data-on', p >= SENT);
  };

  useEffect(() => {
    const layer = root.current?.querySelector('[data-c6="sunday"]');
    if (layer) {
      els.current = {
        hearts: [...layer.querySelectorAll('[data-part="heart"][data-on]')],
        tiles: [...layer.querySelectorAll('[data-part="tile"][data-picked]')],
        bar: layer.querySelector('[data-part="picks-bar"]'),
        mine: layer.querySelector('[data-part="my-picks"]'),
        send: layer.querySelector('[data-part="send"]'),
        note: layer.querySelector('[data-part="sent-note"]'),
        scroll: layer.querySelector<HTMLElement>('[data-part="client-scroll"]'),
      };
    }
    // Three weeks later the page opens further down, on its films.
    const later = root.current?.querySelector<HTMLElement>('[data-c6="later"] [data-part="client-scroll"]');
    if (later) later.style.transform = 'translate3d(0,-230px,0)';
    apply(progress.get());
    return () => {
      els.current = null;
      // Forget what was written, or a remount skips beats it thinks are in place.
      step.current = -1;
      scrolled.current = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useMotionValueEvent(progress, 'change', apply);
}

// ─── Mika's phone ────────────────────────────────────────────────────────

function Mika({ progress }: { progress: MotionValue<number> }) {
  const reveal = useReveal(progress, 0.46, 0.53, 0.63, 0.68, { y: 60, scale: 0.86 });
  const row = useReveal(progress, TOLD - 0.01, TOLD + 0.03, 0.63, 0.68, { y: -16, scale: 0.96 });
  const turn = useTransform(progress, (p) => `perspective(1200px) rotateY(${r2(lerp(-16, -4, camera(seg(p, 0.46, 0.66))))}deg)`);
  const phone = useRef<HTMLDivElement>(null);
  return (
    <div aria-hidden className="pointer-events-none absolute right-[5vw] top-[30svh] z-20 lg:left-[55%] lg:right-auto lg:top-[20svh]">
      <m.div style={reveal}>
        <m.div style={{ transform: turn }}>
          <div ref={phone} className="w-[min(40vw,20svh)] lg:w-[min(230px,26svh)]">
            <Float amp={5} tilt={1.6} duration={5.8} delay={2.6}>
              <PhoneShell time="4:58" night rotateY={-4}>
                <m.div style={row} className="pt-3">
                  <NotificationList platform="phone" heading={TODAY}>
                    <NotificationRow platform="phone" first {...NOTICES.picks} time="now" />
                  </NotificationList>
                </m.div>
              </PhoneShell>
            </Float>
          </div>
        </m.div>
      </m.div>
    </div>
  );
}

/** The morph: the couple's heart flies to Mika's phone and becomes its notification dot. */
function HeartToDot({ progress }: { progress: MotionValue<number> }) {
  const opacity = useTransform(progress, (p) => r2(window4(p, SENT - 0.01, SENT + 0.01, TOLD - 0.005, TOLD + 0.02)));
  const transform = useTransform(progress, (p) => {
    const t = camera(seg(p, SENT, TOLD));
    const wide = window.innerWidth >= 1024;
    const x = lerp(0, wide ? 22 : 26, t);
    const y = lerp(0, wide ? -6 : 4, t) - Math.sin(Math.PI * t) * 8;
    return `translate3d(${r2(x)}vw,${r2(y)}svh,0) scale(${r2(lerp(1, 0.3, t))})`;
  });
  return (
    <m.div aria-hidden style={{ opacity, transform }} className="pointer-events-none absolute left-[38%] top-[46svh] z-30 -ml-8 -mt-8 size-16 lg:left-[37%]">
      <Morph
        progress={progress}
        keys={[
          { at: SENT + 0.01, shape: 'heart' },
          { at: TOLD - 0.01, shape: 'circle' },
        ]}
        fill="#C9764A"
        className="size-full"
      />
    </m.div>
  );
}
