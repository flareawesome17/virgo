'use client';

import { useMotionValueEvent } from 'framer-motion';
import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { useChapterProgress, useMotionGate } from '../motion';

/**
 * Ch4's stage (storyboard §2 Ch4): the server renders the figure; this moves
 * it in place from the chapter's scroll progress. Transform and opacity only,
 * written straight to `[data-part]` elements — no React state per frame.
 *
 * Without motion (reduced motion, no JS, short viewports) it renders its
 * children untouched and attaches nothing.
 */
export function Ch4Stage({
  children,
  className = '',
  slots,
}: {
  children: ReactNode;
  className?: string;
  /** Per guest, the row's translateY (px) after 0, 1, 2 and 3 acceptances (computed on the server from the API order). */
  slots: Record<string, readonly number[]>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const gate = useMotionGate();
  return (
    <div ref={ref} data-part="c4-track" className={className}>
      {children}
      {gate.motion && <Driver track={ref} slots={slots} paused={gate.paused} />}
    </div>
  );
}

// ─── Maths ───────────────────────────────────────────────────────────────

const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const seg = (p: number, a: number, b: number) => clamp((p - a) / (b - a));
/** The page's enter curve, cubic-bezier(0.16, 1, 0.3, 1), approximated (expo out). */
const enter = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
/** Camera / in-out, cubic-bezier(0.65, 0, 0.35, 1), approximated. */
const inOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** In over [a, b], out over [c, d]. */
const window4 = (p: number, a: number, b: number, c: number, d: number) => enter(seg(p, a, b)) * (1 - inOut(seg(p, c, d)));
const r = (n: number) => Math.round(n * 100) / 100;

type Style = { o?: number; t?: string };

function Driver({ track, slots, paused }: { track: RefObject<HTMLDivElement | null>; slots: Record<string, readonly number[]>; paused: boolean }) {
  const progress = useChapterProgress(track, 'track');
  const els = useRef<Map<string, HTMLElement[]>>(new Map());
  const last = useRef<WeakMap<HTMLElement, string>>(new WeakMap());
  const ringing = useRef<Animation[]>([]);
  const rang = useRef(false);
  const pausedRef = useRef(paused);

  const find = (name: string): HTMLElement[] => {
    const cached = els.current.get(name);
    if (cached) return cached;
    const found = [...(track.current?.querySelectorAll<HTMLElement>(name.startsWith('[') ? name : `[data-part="${name}"]`) ?? [])];
    // The section's horizon band sits outside the track.
    if (!found.length && name === 'c4-horizon') {
      const band = track.current?.closest('section')?.querySelector<HTMLElement>('[data-part="c4-horizon"]');
      if (band) found.push(band);
    }
    els.current.set(name, found);
    return found;
  };

  const orig = useRef<Map<HTMLElement, { o: string; t: string }>>(new Map());
  const keep = (el: HTMLElement) => {
    if (!orig.current.has(el)) orig.current.set(el, { o: el.style.opacity, t: el.style.transform });
  };
  const put = (name: string, s: Style) => {
    for (const el of find(name)) {
      keep(el);
      const key = `${s.o ?? ''}|${s.t ?? ''}`;
      if (last.current.get(el) === key) continue;
      last.current.set(el, key);
      if (s.o !== undefined) el.style.opacity = String(r(s.o));
      if (s.t !== undefined) el.style.transform = s.t;
    }
  };

  const stopRings = () => {
    ringing.current.forEach((a) => a.cancel());
    ringing.current = [];
  };

  const startRings = () => {
    if (pausedRef.current) return;
    stopRings();
    find('c4-ring').forEach((el, i) => {
      if (typeof el.animate !== 'function') return;
      ringing.current.push(
        el.animate(
          [
            { opacity: 0, transform: 'scale(0.55)' },
            { opacity: 0.85, transform: 'scale(0.7)', offset: 0.12 },
            { opacity: 0, transform: 'scale(1.55)' },
          ],
          // Two cycles, then quiet (§1.7, §1.9).
          { duration: 1700, delay: i * 520, iterations: 2, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'both' },
        ),
      );
    });
  };

  const apply = (raw: number) => {
    const mobile = window.innerWidth < 1024;
    // Phones: the copy comes first and the figure sticks after it, so the beats start when it sticks.
    let p = raw;
    const first = find('c4-copy-1')[0];
    const tr = track.current;
    if (mobile && first && tr) {
      // Where the figure starts to stick: under the first copy block (its 4 svh margin), less the 56 px header.
      const sticks = first.offsetTop + first.offsetHeight + window.innerHeight * 0.04 - 56;
      const range = tr.offsetHeight - window.innerHeight;
      const p0 = range > 0 ? clamp(sticks / range) : 0;
      p = p0 < 1 ? clamp((raw - p0) / (1 - p0)) : raw;
    }
    const k = mobile ? 0.55 : 1; // tilt within 10° on phones, 18° on desktop

    // The phone: tilted, then square on and lifted for the 5:00 ring.
    const turn = inOut(seg(p, 0, 0.8));
    const ry = lerp(-13, 0, turn) + Math.sin(seg(p, 0.1, 0.7) * Math.PI) * 6;
    const rx = lerp(8, 0, turn);
    const lift = lerp(0, 36, inOut(seg(p, 0.78, 0.9)));
    find('[data-part="c4-phone"] [data-part="slab-body"]').forEach((el) => {
      const t = `rotateX(${r(rx * k)}deg) rotateY(${r(ry * k)}deg) translateZ(${r(lift)}px)`;
      if (last.current.get(el) !== t) {
        keep(el);
        last.current.set(el, t);
        el.style.transform = t;
      }
    });
    const sheenA = r(clamp(0.5 - (ry * k) / 36));
    put('[data-part="c4-phone"] [data-part="slab-sheen-a"]', { o: sheenA });
    put('[data-part="c4-phone"] [data-part="slab-sheen-b"]', { o: 1 - sheenA });
    put('[data-part="c4-phone"] [data-part="slab-shadow"]', { o: 1 - lift / 120, t: `scale(${r(1 + lift / 500)})` });

    // Calendar → event (a push, as the app navigates).
    const push = enter(seg(p, 0.13, 0.21));
    put('c4-cal', { o: 1 - push, t: `translate3d(${r(-28 * push)}%,0,0)` });
    put('c4-event', { o: push, t: `translate3d(${r(32 * (1 - push))}%,0,0)` });
    put('c4-selected-glow', { o: window4(p, 0.02, 0.07, 0.12, 0.17) });

    // Who's coming: Ernie, Kenn, Bea say yes; the list re-sorts by sliding rows.
    const yes = [seg(p, 0.23, 0.27), seg(p, 0.29, 0.33), seg(p, 0.35, 0.39)];
    for (const [guest, shifts] of Object.entries(slots)) {
      let y = shifts[0];
      yes.forEach((t, i) => {
        y = lerp(y, shifts[i + 1], enter(t));
      });
      put(`attendee-${guest}`, { t: `translate3d(0,${r(y)}px,0)` });
    }
    // Statuses flip in invitation order: ernie, kenn, bea.
    (['ernie', 'kenn', 'bea'] as const).forEach((g, i) => {
      const on = clamp(yes[i] * 1.6);
      put(`[data-part="status-${g}"] > [data-face="pending"]`, { o: 1 - on });
      put(`[data-part="status-${g}"] > [data-face="accepted"]`, { o: on });
    });
    put('c4-toast', { o: window4(p, 0.23, 0.27, 0.38, 0.42), t: `translate3d(0,${r(-24 * (1 - enter(seg(p, 0.23, 0.28))))}px,0)` });

    // The move: 6:30 rolls to 6:00, the crew hear it.
    const roll = inOut(seg(p, 0.44, 0.5));
    put('call-roll', { t: `translate3d(0,${r(-20 * roll)}px,0)` });
    find('[data-part^="c4-card-"]').forEach((el, i) => {
      const a = 0.47 + i * 0.03;
      const t = enter(seg(p, a, a + 0.07));
      const out = inOut(seg(p, 0.64, 0.69));
      const fan = mobile ? { x: 0, y: 0, z: 0, ry: 0 } : { x: -40 - i * 26, y: i * 14, z: -i * 70, ry: 10 + i * 3 };
      const tf = `translate3d(${r(lerp(70, fan.x, t))}px,${r(lerp(30, fan.y, t) - out * 16)}px,${r(lerp(-160, fan.z, t))}px) rotateY(${r(lerp(-14, fan.ry, t) * k)}deg)`;
      put(`c4-card-${i}`, { o: t * (1 - out), t: tf });
    });
    put('c4-email', { o: window4(p, 0.55, 0.61, 0.64, 0.69), t: `translate3d(0,${r(18 * (1 - enter(seg(p, 0.55, 0.62))))}px,0)` });

    // New reminder: the sheet rises, then the row lands on the event.
    const sheetIn = enter(seg(p, 0.62, 0.68));
    const sheetOut = inOut(seg(p, 0.75, 0.79));
    put('c4-sheet', { o: sheetIn * (1 - sheetOut * 0.9), t: `translate3d(0,${r(100 * (1 - sheetIn) + 100 * sheetOut)}%,0)` });
    put('reminder-row', { o: enter(seg(p, 0.77, 0.81)) });

    // 5:00 AM: the phone goes to its lock screen, no service, and rings.
    const lock = inOut(seg(p, 0.79, 0.85));
    put('c4-lock', { o: lock });
    put('c4-display', { o: enter(seg(p, 0.82, 0.9)) * 0.9, t: `translate3d(0,${r(30 * (1 - enter(seg(p, 0.82, 0.92))))}px,0) scale(${r(lerp(0.94, 1, enter(seg(p, 0.82, 0.92))))})` });
    put('c4-slate', { o: enter(seg(p, 0.84, 0.9)) });
    put('c4-horizon', { o: enter(seg(p, 0.84, 1)), t: `translate3d(0,${r(40 * (1 - enter(seg(p, 0.84, 1))))}%,0)` });

    if (p >= 0.86 && !rang.current) {
      rang.current = true;
      startRings();
    } else if (p < 0.8 && rang.current) {
      rang.current = false;
      stopRings();
    }
  };

  useMotionValueEvent(progress, 'change', apply);

  // Attach: take the current state at once (deep links, restores), with a short dip.
  useEffect(() => {
    els.current.clear();
    const stage = find('c4-stage')[0];
    apply(progress.get());
    // useScroll measures on the next frame: take that reading too.
    const saved = orig.current;
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => apply(progress.get())));
    stage?.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'cubic-bezier(0.2, 0, 0, 1)' });
    return () => {
      cancelAnimationFrame(raf);
      stopRings();
      // Motion turned off at runtime: hand the server's resting state back.
      saved.forEach((v, el) => {
        el.style.opacity = v.o;
        el.style.transform = v.t;
      });
      saved.clear();
      // Forget what was written, or a remount (React dev runs effects twice;
      // the gate can reopen) skips values it thinks are already in place.
      last.current = new WeakMap();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pause motion stops the rings at once; resuming does not replay them.
  useEffect(() => {
    pausedRef.current = paused;
    if (paused) stopRings();
  }, [paused]);

  return null;
}
