'use client';

import { useMotionValueEvent, useScroll, type MotionValue } from 'framer-motion';
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { useChapterProgress, useMotionGate } from '../motion';
import { usePublishSky } from '../sky-stage';
import { NEARBY_AT, nearby } from '../sky/nearby';

/**
 * Ch2's stage (storyboard Ch2): enhances the server-rendered chapter in
 * place. The sky draws the radar; the panel (desktop) and the phone (mobile)
 * flip their search state in step with it (r5 → r25 → r25-erased, the NEAR
 * chip picked first), and their slabs turn a little in depth. Nothing
 * re-renders on scroll: beats write attributes, counters and transforms.
 */

type State = 'r5' | 'r25' | 'r25-erased';

/** Each state's search, computed on the server from story.ts (counts per role slug, rows shown by slug). */
export type NearbyBeats = Record<State, { radius: number; counts: Record<string, number>; shown: string[]; selected: string[] }>;

const clamp = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const span = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
/** The enter curve, cubic-bezier(0.16, 1, 0.3, 1), close enough for scroll-linked poses. */
const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t), 4);

function stateAt(p: number): State {
  if (p < NEARBY_AT.r25 + 0.06) return 'r5';
  if (p < NEARBY_AT.erase) return 'r25';
  return 'r25-erased';
}

const q = (root: Element, name: string) => root.querySelector<HTMLElement>(`[data-part="${name}"]`);

/** Flips a NearbyPhone or NearbyPanel to a state, in place (the mock contract: attributes, counters, `hidden`). */
function applyNearby(el: HTMLElement, s: State, beats: NearbyBeats, panel: boolean) {
  if (el.dataset.state === s) return;
  el.dataset.state = s;
  const b = beats[s];
  el.querySelectorAll<HTMLElement>('[data-part^="radius-"]').forEach((r) => {
    r.toggleAttribute('data-on', r.dataset.part === `radius-${b.radius}`);
  });
  for (const [slug, n] of Object.entries(b.counts)) {
    const chip = q(el, `role-${slug}`);
    const count = q(el, `count-${slug}`);
    if (count) count.textContent = String(n);
    if (!chip) continue;
    chip.dataset.count = String(n);
    const on = b.selected.includes(slug);
    const empty = !on && n === 0;
    if (panel) chip.toggleAttribute('data-empty', empty);
    chip.style.opacity = empty ? (panel ? '0.6' : '0.55') : '1';
  }
  el.querySelectorAll<HTMLElement>('[data-part^="row-"]').forEach((row) => {
    row.hidden = !b.shown.includes((row.dataset.part ?? '').slice(4));
  });
}

function setNear(el: HTMLElement, on: boolean) {
  const near = el.querySelector<HTMLElement>('[data-part="nearby-near"], [data-part="panel-near"]');
  if (near && near.hasAttribute('data-on') !== on) near.toggleAttribute('data-on', on);
}

/** The panel's own scroll, by translating its column (the mock's contract). */
function scrollPanel(root: HTMLElement, y: number) {
  const scroller = q(root, 'panel-scroll');
  if (scroller) scroller.style.transform = `translateY(${y.toFixed(1)}px)`;
}

/** A slab's turn: body transform, sheen crossfade, shadow lift. */
function poseSlab(wrap: HTMLElement | null, rx: number, ry: number, tz: number, ty = 0) {
  const slab = wrap?.querySelector<HTMLElement>('[data-part="slab"]');
  if (!slab) return;
  const body = slab.querySelector<HTMLElement>(':scope > [data-part="slab-body"]');
  if (body) body.style.transform = `translateY(${ty.toFixed(1)}px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) translateZ(${tz.toFixed(1)}px)`;
  const a = slab.querySelector<HTMLElement>('[data-part="slab-sheen-a"]');
  const bb = slab.querySelector<HTMLElement>('[data-part="slab-sheen-b"]');
  const t = clamp((ry + 14) / 28);
  if (a) a.style.opacity = (1 - t).toFixed(3);
  if (bb) bb.style.opacity = t.toFixed(3);
  const shadow = slab.querySelector<HTMLElement>(':scope > [data-part="slab-shadow"]');
  if (shadow) {
    shadow.style.transform = `translateY(${(ty * 0.4).toFixed(1)}px) scale(${(1 + tz / 400).toFixed(3)})`;
    shadow.style.opacity = (1 - tz / 160).toFixed(3);
  }
}

/** Track-equivalent progress from the cover progress: 0 when the track's top meets the viewport's, 1 when the bottoms meet. */
function useTrackClock(track: HTMLElement) {
  const ref = useRef<HTMLElement | null>(track);
  const cover = useChapterProgress(ref, 'cover');
  const size = useRef({ h: 1, v: 1 });
  useEffect(() => {
    const measure = () => {
      size.current = { h: track.offsetHeight, v: window.innerHeight };
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(track);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [track]);
  const toTrack = (c: number) => {
    const { h, v } = size.current;
    return h > v ? (c * (h + v) - v) / (h - v) : c;
  };
  return { cover, toTrack };
}

function Driver({ root, track, beats }: { root: HTMLElement; track: HTMLElement; beats: NearbyBeats }) {
  const { cover, toTrack } = useTrackClock(track);
  usePublishSky(cover, (c, l) => nearby(toTrack(c), l));

  const panel = q(root, 'nearby-panel');
  const panelSlab = q(root, 'ch2-panel-slab');
  const hud = root.querySelectorAll<HTMLElement>('[data-part="ch2-hud"] > [data-face]');
  // The panel's own scroll: from NEAR at the top to WITHIN, so the rows are in view as they arrive.
  const reach = useRef(0);
  useEffect(() => {
    // Both are laid out against panel-viewport (the nearest positioned box); transforms do not touch offsets.
    const scroller = q(root, 'panel-scroll');
    const within = q(root, 'panel-within');
    if (scroller && within) reach.current = Math.max(0, within.offsetTop - scroller.offsetTop - 12);
  }, [root]);

  const apply = (c: number) => {
    const p = toTrack(c);
    if (window.innerWidth >= 1024) {
      if (panel) {
        applyNearby(panel, stateAt(p), beats, true);
        setNear(panel, p >= NEARBY_AT.near);
      }
      scrollPanel(root, -reach.current * easeOut(span(p, 0.07, 0.16)));
      // The panel stands in from below as the chapter arrives, turns toward the radar as it widens, and settles flat for the erase.
      const enter = easeOut(span(c, 0.08, 0.34));
      const widen = span(p, NEARBY_AT.r25, NEARBY_AT.r25 + 0.18);
      const settle = span(p, NEARBY_AT.smear, NEARBY_AT.erase);
      const ry = -16 + 6 * enter + 6 * widen - 4 * settle;
      const rx = 4 + 10 * (1 - enter) - 2 * settle;
      poseSlab(panelSlab, rx, ry, 30 * widen * (1 - settle), 60 * (1 - enter));
      // The readout over the radar: 5 km, then 25 km.
      hud.forEach((f) => {
        const on = f.dataset.face === (p < NEARBY_AT.r25 + 0.06 ? '5' : '25');
        f.style.opacity = on ? String(span(p, NEARBY_AT.r5 - 0.04, NEARBY_AT.r5 + 0.04) * (1 - span(p, 0.9, 1))) : '0';
        f.style.transform = on ? 'translateY(0)' : 'translateY(-10px)';
      });
    }
  };
  useMotionValueEvent(cover, 'change', apply);
  useEffect(() => {
    apply(cover.get());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <PhoneDriver root={root} beats={beats} />;
}

/** Phones: the phone scrolls in flow between the cards and flips with its own place on screen. */
function phoneStateAt(p: number): State {
  if (p < 0.4) return 'r5';
  if (p < 0.62) return 'r25';
  return 'r25-erased';
}

function PhoneDriver({ root, beats }: { root: HTMLElement; beats: NearbyBeats }) {
  const phone = q(root, 'nearby-phone');
  const ref = useRef<HTMLElement | null>(q(root, 'ch2-phone-slab'));
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const apply = (p: number) => {
    if (window.innerWidth >= 1024) return;
    if (phone) {
      applyNearby(phone, phoneStateAt(p), beats, false);
      setNear(phone, p >= 0.16);
    }
    // Rises tipped back, faces the reader while it is read, and tips away as it leaves (within 10°).
    const enter = easeOut(span(p, 0.05, 0.32));
    const leave = span(p, 0.7, 1);
    poseSlab(ref.current, 4 + 6 * (1 - enter) - 2 * leave, -8 + 6 * enter + 4 * span(p, 0.4, 0.62) - 2 * leave, 24 * enter * (1 - leave), 0);
  };
  useMotionValueEvent(scrollYProgress as MotionValue<number>, 'change', apply);
  useEffect(() => {
    apply(scrollYProgress.get());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

export function Ch2Island({ children, beats }: { children: ReactNode; beats: NearbyBeats }) {
  const gate = useMotionGate();
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const track = root ? q(root, 'ch2-track') : null;
  return (
    <div ref={setRoot} className="contents">
      {children}
      {gate.motion && root && track && <Driver root={root} track={track} beats={beats} />}
    </div>
  );
}

/**
 * "Try the distance": the radios are real form controls and the radar swaps
 * by CSS alone (`:has(:checked)`), so the demo works with no JS and under
 * reduced motion. This only speaks the new count, politely.
 */
export function Ch2Demo({ children, sentences }: { children: ReactNode; sentences: Record<string, string> }) {
  const [said, setSaid] = useState('');
  const onChange = (e: ChangeEvent<HTMLDivElement>) => {
    const t = e.target as unknown as HTMLInputElement;
    if (t.type === 'radio' && sentences[t.value]) setSaid(sentences[t.value]);
  };
  return (
    <div onChange={onChange}>
      {children}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {said}
      </p>
    </div>
  );
}
