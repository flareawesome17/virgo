'use client';

import { useMotionValueEvent, useScroll, type MotionValue } from 'framer-motion';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useChapterProgress, useMotionGate } from '../motion';
import { usePublishSky } from '../sky-stage';
import { CONNECT_AT, connectFrame } from '../sky/connect';

/**
 * Ch3's stage (storyboard Ch3): enhances the server-rendered chapter in
 * place. The sky carries the threads and the turn to Virgo (sky/connect.ts);
 * the phone's screens crossfade through the beats — applications, Accept ×3,
 * Ernie's terms and Confirm, the booking flipping to Agreed, the crew's
 * thread — and the phone steps aside while the figure forms. Transform and
 * opacity only, written straight to the elements; nothing re-renders.
 */

const clamp = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const span = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t), 4);
const q = (root: Element, name: string) => root.querySelector<HTMLElement>(`[data-part="${name}"]`);

/** Each screen's window on the chapter clock: [in, out]. Several windows share a screen. */
const SCREENS: Record<string, readonly (readonly [number, number])[]> = {
  'ch3-s-new': [[-1, 0.24]],
  'ch3-s-apply': [
    [0.24, 0.34],
    [0.5, 0.57],
  ],
  'ch3-s-terms-new': [[0.34, 0.45]],
  'ch3-s-terms': [[0.45, 0.5]],
  'ch3-s-thread': [[0.57, 2]],
};
const FADE = 0.018;

function weight(p: number, windows: readonly (readonly [number, number])[]) {
  let w = 0;
  for (const [a, b] of windows) w = Math.max(w, Math.min(span(p, a - FADE, a + FADE), 1 - span(p, b - FADE, b + FADE)));
  return w;
}

/** Shows one face of every `[data-face]` flip under parts matching a selector. */
function flip(root: Element, selector: string, face: string) {
  root.querySelectorAll<HTMLElement>(`${selector} > [data-face]`).forEach((f) => {
    const on = f.dataset.face === face;
    f.style.opacity = on ? '1' : '0';
    f.style.transform = on ? 'none' : 'translateY(3px)';
  });
}

/** A press: a short dip in scale around `at`. */
const press = (p: number, at: number) => 1 - 0.07 * Math.max(0, 1 - Math.abs(p - at) / 0.012);

function poseSlab(wrap: HTMLElement | null, rx: number, ry: number, tz: number, tx = 0, opacity = 1) {
  const slab = wrap?.querySelector<HTMLElement>('[data-part="slab"]');
  if (!slab || !wrap) return;
  wrap.style.opacity = opacity.toFixed(3);
  wrap.style.transform = tx ? `translateX(${tx.toFixed(1)}px)` : '';
  const body = slab.querySelector<HTMLElement>(':scope > [data-part="slab-body"]');
  if (body) body.style.transform = `rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) translateZ(${tz.toFixed(1)}px)`;
  const t = clamp((ry + 14) / 28);
  const a = slab.querySelector<HTMLElement>('[data-part="slab-sheen-a"]');
  const b = slab.querySelector<HTMLElement>('[data-part="slab-sheen-b"]');
  if (a) a.style.opacity = (1 - t).toFixed(3);
  if (b) b.style.opacity = t.toFixed(3);
}

/** Plays the phone's screens at chapter-clock time `p` (the same table on both layouts). */
function playScreens(root: HTMLElement, p: number) {
  for (const [name, windows] of Object.entries(SCREENS)) {
    const el = q(root, name);
    if (!el) continue;
    const w = weight(p, windows);
    el.style.opacity = w.toFixed(3);
    el.style.transform = w >= 0.999 ? 'none' : `translateY(${((1 - w) * 14).toFixed(1)}px) scale(${(0.985 + 0.015 * w).toFixed(4)})`;
    el.style.visibility = w <= 0.001 ? 'hidden' : 'visible';
  }
  // The applications arrive (a notice drops in), then Accept presses, bottom up as the API lists them.
  const toast = q(root, 'ch3-toast');
  if (toast) {
    const t = span(p, 0.0, 0.05) * (1 - span(p, 0.12, 0.16));
    toast.style.opacity = t.toFixed(3);
    toast.style.transform = `translateY(${(-18 * (1 - easeOut(span(p, 0, 0.06)))).toFixed(1)}px)`;
  }
  const accepts: [string, number][] = [
    ['ernie', CONNECT_AT.accept],
    ['kenn', CONNECT_AT.accept + 0.035],
    ['bea', CONNECT_AT.accept + 0.06],
  ];
  const fresh = q(root, 'ch3-s-new');
  if (fresh) {
    for (const [hire, at] of accepts) {
      const btn = q(fresh, `accept-${hire}`);
      if (btn) btn.style.transform = `scale(${press(p, at).toFixed(3)})`;
      const row = q(fresh, `applicant-${hire}`);
      if (row) row.style.opacity = p > at + 0.012 ? '0.55' : '1';
    }
  }
  // Ernie confirms; then, on Mika's side, Waiting on them → Agreed.
  const termsNew = q(root, 'ch3-s-terms-new');
  const confirm = termsNew && q(termsNew, 'confirm-button');
  if (confirm) confirm.style.transform = `scale(${press(p, CONNECT_AT.confirm - 0.02).toFixed(3)})`;
  const apply = q(root, 'ch3-s-apply');
  if (apply) flip(apply, '[data-part^="booking-"][data-part$="-ernie"]', p >= CONNECT_AT.agreed ? 'agreed' : 'waiting');
  // The thread: Kenn's reply lands, then every tick fills.
  const thread = q(root, 'ch3-s-thread');
  if (thread) {
    const reply = q(thread, 'bubble-reply');
    if (reply) {
      const r = easeOut(span(p, 0.61, 0.645));
      reply.style.opacity = r.toFixed(3);
      reply.style.transform = `translateY(${(10 * (1 - r)).toFixed(1)}px)`;
    }
    flip(thread, '[data-part="bubble-ask-ticks"]', p >= 0.65 ? 'read' : 'delivered');
    flip(thread, '[data-part="bubble-ask-seen"]', p >= 0.65 ? '3' : '1');
  }
}

function Driver({ root, track }: { root: HTMLElement; track: HTMLElement }) {
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
  usePublishSky(cover, (c, l) => connectFrame(toTrack(c), l));

  const stage = q(root, 'ch3-stage');
  const apply = (c: number) => {
    if (window.innerWidth < 1024) return;
    const p = toTrack(c);
    if (stage) playScreens(stage, p);
    // Stands in from below-right, faces the reader for the beats, then steps aside so nothing covers the figure.
    const enter = easeOut(span(c, 0.1, 0.36));
    const aside = easeOut(span(p, CONNECT_AT.clear, CONNECT_AT.clear + 0.05));
    const turn = -14 + 8 * enter + 3 * span(p, 0.34, 0.5) + 16 * aside;
    poseSlab(stage, 4 + 8 * (1 - enter), Math.min(16, turn), 20 * enter * (1 - aside), 120 * aside, 1 - aside);
  };
  useMotionValueEvent(cover, 'change', apply);
  useEffect(() => {
    apply(cover.get());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <PhoneDriver root={root} />;
}

/** Phones: the phone scrolls in flow between the cards and plays its screens with its own place on screen. */
function PhoneDriver({ root }: { root: HTMLElement }) {
  const ref = useRef<HTMLElement | null>(q(root, 'ch3-stage'));
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const apply = (own: number) => {
    if (window.innerWidth >= 1024 || !ref.current) return;
    // The phone's time on screen, 0.18 → 0.82, plays the beats up to the thread.
    const p = span(own, 0.16, 0.78) * 0.7;
    playScreens(ref.current, p);
    const enter = easeOut(span(own, 0.05, 0.3));
    const leave = span(own, 0.72, 1);
    poseSlab(ref.current, 4 + 6 * (1 - enter) - 2 * leave, -8 + 6 * enter + 3 * span(p, 0.34, 0.5) - 2 * leave, 22 * enter * (1 - leave));
  };
  useMotionValueEvent(scrollYProgress as MotionValue<number>, 'change', apply);
  useEffect(() => {
    apply(scrollYProgress.get());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

export function Ch3Island({ children }: { children: ReactNode }) {
  const gate = useMotionGate();
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const track = root ? q(root, 'ch3-track') : null;
  return (
    <div ref={setRoot} className="contents">
      {children}
      {gate.motion && root && track && <Driver root={root} track={track} />}
    </div>
  );
}
