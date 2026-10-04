'use client';

import { useMotionValueEvent } from 'framer-motion';
import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { useChapterProgress, useMotionGate } from '../motion';

/**
 * Ch5's stage (storyboard §2 Ch5): the page's one long pin. Night turns to
 * golden hour through pre-baked layers (opacity only), the time chip steps
 * through the day, the crew's tiles fly into one album, the album resolves,
 * the activity lands and the meter fills by scaleX.
 *
 * Everything is written straight to `[data-part]` elements from the scroll
 * progress: transform and opacity only, no React state per frame. Without
 * motion it renders its children untouched.
 */
export function Ch5Stage({
  children,
  className = '',
  meter,
}: {
  children: ReactNode;
  className?: string;
  /** The meter's two readings, as the app prints them (written into its reserved-width spans). */
  meter: { fromUsed: string; toUsed: string; fromFiles: string; toFiles: string; fromFill: number; toFill: number };
}) {
  const ref = useRef<HTMLDivElement>(null);
  const gate = useMotionGate();
  return (
    <div ref={ref} data-part="c5-track" className={className}>
      {children}
      {gate.motion && <Driver track={ref} meter={meter} lite={gate.lite} />}
    </div>
  );
}

// ─── Maths ───────────────────────────────────────────────────────────────

const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const seg = (p: number, a: number, b: number) => clamp((p - a) / (b - a));
/** cubic-bezier(0.16, 1, 0.3, 1), approximated (expo out). */
const enter = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
/** cubic-bezier(0.65, 0, 0.35, 1), approximated. */
const inOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const win = (p: number, a: number, b: number, c: number, d: number) => enter(seg(p, a, b)) * (1 - inOut(seg(p, c, d)));
const r = (n: number) => Math.round(n * 100) / 100;

/** The time chip's steps: [from p, face index]. */
const CHIP_STEPS = [0, 0.1, 0.16, 0.22, 0.3];

type Fly = { el: HTMLElement; dx: number; dy: number; i: number };

function Driver({
  track,
  meter,
  lite,
}: {
  track: RefObject<HTMLDivElement | null>;
  meter: { fromUsed: string; toUsed: string; fromFiles: string; toFiles: string; fromFill: number; toFill: number };
  lite: boolean;
}) {
  const progress = useChapterProgress(track, 'track');
  const cache = useRef<Map<string, HTMLElement[]>>(new Map());
  const last = useRef<WeakMap<HTMLElement, string>>(new WeakMap());
  const flies = useRef<Fly[]>([]);
  const meterText = useRef<'from' | 'to' | ''>('');

  const find = (sel: string): HTMLElement[] => {
    const hit = cache.current.get(sel);
    if (hit) return hit;
    const q = sel.startsWith('[') ? sel : `[data-part="${sel}"]`;
    const found = [...(track.current?.querySelectorAll<HTMLElement>(q) ?? [])];
    cache.current.set(sel, found);
    return found;
  };

  const orig = useRef<Map<HTMLElement, { o: string; t: string }>>(new Map());
  const write = (el: HTMLElement, o?: number, t?: string) => {
    if (!orig.current.has(el)) orig.current.set(el, { o: el.style.opacity, t: el.style.transform });
    const key = `${o === undefined ? '' : r(o)}|${t ?? ''}`;
    if (last.current.get(el) === key) return;
    last.current.set(el, key);
    if (o !== undefined) el.style.opacity = String(r(o));
    if (t !== undefined) el.style.transform = t;
  };
  const put = (sel: string, o?: number, t?: string) => find(sel).forEach((el) => write(el, o, t));

  /** Where each flying tile lands: measured from untransformed wrappers, once per layout. */
  const measure = () => {
    const target = find('c5-album-anchor')[0]?.getBoundingClientRect();
    flies.current = find('c5-fly').map((el, i) => {
      const from = el.parentElement?.getBoundingClientRect();
      if (!target || !from || !from.width) return { el, dx: 0, dy: 0, i };
      const col = i % 4;
      return {
        el,
        i,
        dx: target.left + target.width * (0.2 + col * 0.2) - (from.left + from.width / 2),
        dy: target.top + target.height * 0.55 - (from.top + from.height / 2),
      };
    });
  };

  const apply = (p: number) => {
    const mobile = window.innerWidth < 1024;
    const k = mobile ? 0.55 : 1;

    // ── The light (0.08–0.30): opacity only, no copy over the mid-blend.
    put('c5-night', 1 - inOut(seg(p, 0.08, 0.22)));
    put('c5-dawn', win(p, 0.08, 0.15, 0.17, 0.26));
    put('c5-gold', inOut(seg(p, 0.14, 0.26)));
    put('c5-stars', 1 - seg(p, 0.06, 0.16));
    // The sun: Mika's star on the horizon, rising, then sinking for the reception.
    const rise = inOut(seg(p, 0.06, 0.27));
    const sink = inOut(seg(p, 0.3, 0.4));
    put('c5-sun', 1 - seg(p, 0.36, 0.41), `translate3d(-50%,calc(-50% + ${r(lerp(0, -200, rise) + 260 * sink)}px),0) scale(${r(lerp(0.18, 1, rise))})`);
    put('c5-bloom', mobile ? 0 : 0.25 * win(p, 0.22, 0.27, 0.27, 0.33));
    put('c5-vf', win(p, 0.12, 0.18, 0.28, 0.32));
    const word = enter(seg(p, 0.19, 0.26));
    put('c5-word', word * (1 - inOut(seg(p, 0.3, 0.35))), `translate3d(0,${r(28 * (1 - word))}px,0)`);

    // ── The time chip: night surface, paper from 0.20; steps through the day.
    const paper = seg(p, 0.19, 0.21);
    put('c5-chip-night', 1 - paper);
    put('c5-chip-paper', paper);
    const step = CHIP_STEPS.reduce((n, at, i) => (p >= at ? i : n), 0);
    find('[data-part="c5-chip"] [data-face]').forEach((el) => {
      const on = Number(el.dataset.face) === step;
      write(el, on ? 1 : 0, on ? 'translate3d(0,0,0)' : 'translate3d(0,6px,0)');
    });
    put('c5-chip', 1 - inOut(seg(p, 0.42, 0.47)));

    // ── The crest (0.30–0.40): Kenn's film at the reception.
    const crest = win(p, 0.3, 0.34, 0.4, 0.44);
    put('c5-crest', crest, `translate3d(0,${r(20 * (1 - enter(seg(p, 0.3, 0.35))))}px,0) scale(${r(lerp(0.96, 1, enter(seg(p, 0.3, 0.35))))})`);

    // ── Copy (from 0.40). Desktop: the sheet stays, the H3s take turns. Mobile: one beat at a time.
    const sheetIn = enter(seg(p, 0.4, 0.45));
    put('c5-copy', sheetIn, `translate3d(0,${r(24 * (1 - sheetIn))}px,0)`);
    const beats = mobile
      ? [win(p, 0.4, 0.44, 0.53, 0.56), win(p, 0.56, 0.59, 0.62, 0.64), win(p, 0.64, 0.67, 0.7, 0.72), 0, enter(seg(p, 0.72, 0.75))]
      : [1, win(p, 0.52, 0.56, 0.62, 0.64), win(p, 0.64, 0.67, 0.71, 0.73), enter(seg(p, 0.73, 0.77)), 0];
    beats.forEach((o, i) => put(`c5-beat-${i}`, o, `translate3d(0,${r(12 * k * (1 - o))}px,0)`));
    put('c5-minibar', undefined, `scaleX(${r(lerp(meter.fromFill, meter.toFill, inOut(seg(p, 0.76, 0.9))))})`);

    // ── The crew's devices, the gold threads, the flights (desktop).
    find('c5-dev').forEach((el, i) => {
      const t = enter(seg(p, 0.4 + i * 0.015, 0.45 + i * 0.015));
      write(el, t, `translate3d(0,${r(16 * (1 - t))}px,${r(40 * (1 - t))}px)`);
    });
    put('c5-threads', mobile || lite ? 0 : win(p, 0.42, 0.46, 0.6, 0.64));
    if (!mobile && !lite) {
      for (const f of flies.current) {
        const a = 0.44 + (f.i % 4) * 0.025 + Math.floor(f.i / 4) * 0.008;
        const t = inOut(seg(p, a, a + 0.07));
        const arc = Math.sin(t * Math.PI) * -60;
        const o = t <= 0 || t >= 1 ? 0 : Math.min(1, t * 6, (1 - t) * 5);
        write(f.el, o, `translate3d(${r(f.dx * t)}px,${r(f.dy * t + arc)}px,${r(Math.sin(t * Math.PI) * 120)}px) rotateY(${r(lerp(-18, 0, t))}deg) scale(${r(lerp(1, 0.7, t))})`);
      }
    }

    // ── The album resolves (0.42–0.72).
    const album = enter(seg(p, 0.42, 0.5));
    const fold = inOut(seg(p, 0.92, 1));
    put(
      'c5-album',
      album,
      `translate3d(0,${r(40 * (1 - album))}px,${r(-120 * (1 - album) - 40 * fold)}px) rotateX(${r((10 * (1 - album) + 4) * k)}deg) rotateY(${r((-8 + 6 * album) * k)}deg) scale(${r(1 - 0.05 * fold)})`,
    );
    const tiles = find('[data-part="c5-album"] [data-part="tile"]');
    tiles.forEach((el, i) => {
      const n = tiles.length / 2 || 1; // two grids (phone, web): one of them is display:none
      const j = i % Math.ceil(n);
      const a = (mobile ? 0.46 : 0.52) + j * (mobile ? 0.022 : 0.012);
      const t = enter(seg(p, a, a + 0.06));
      write(el, t, `translate3d(0,${r(-14 * (1 - t))}px,0) scale(${r(lerp(0.86, 1, t))})`);
    });
    put('[data-part="c5-album"] [data-part="day-meta"]', enter(seg(p, 0.56, 0.6)));

    // ── Activity and the one meter (0.72–0.92).
    const row = enter(seg(p, 0.7, 0.76));
    put('c5-row', row, `translate3d(0,${r(36 * (1 - row))}px,${r(60 * row)}px)`);
    const rows = find('[data-part="c5-row"] [data-part="activity-row"]');
    rows.forEach((el, i) => {
      // Newest first: the oldest (last) row lands first.
      const a = 0.73 + (rows.length - 1 - i) * 0.035;
      const t = enter(seg(p, a, a + 0.04));
      write(el, t, `translate3d(0,${r(-8 * (1 - t))}px,0)`);
    });
    const fill = inOut(seg(p, 0.77, 0.9));
    put('[data-part="c5-row"] [data-part="meter-fill"]', undefined, `scaleX(${r(lerp(meter.fromFill, meter.toFill, fill))})`);
    const reading = fill >= 0.5 ? 'to' : 'from';
    if (reading !== meterText.current) {
      meterText.current = reading;
      find('[data-part="c5-row"] [data-part="meter-used"]').forEach((el) => (el.textContent = reading === 'to' ? meter.toUsed : meter.fromUsed));
      find('[data-part="c5-row"] [data-part="meter-files"]').forEach((el) => (el.textContent = reading === 'to' ? meter.toFiles : meter.fromFiles));
    }
  };

  useMotionValueEvent(progress, 'change', apply);

  useEffect(() => {
    cache.current.clear();
    measure();
    apply(progress.get());
    // useScroll measures on the next frame: take that reading too.
    const saved = orig.current;
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => apply(progress.get())));
    find('c5-stage')[0]?.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'cubic-bezier(0.2, 0, 0, 1)' });
    const onResize = () => {
      // Flights are measured untransformed: reset them first.
      flies.current.forEach((f) => {
        f.el.style.transform = '';
        last.current.delete(f.el);
      });
      measure();
      apply(progress.get());
    };
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      // Motion turned off at runtime: hand the server's resting state back.
      saved.forEach((v, el) => {
        el.style.opacity = v.o;
        el.style.transform = v.t;
      });
      saved.clear();
      // Forget what was written, or a remount (React dev runs effects twice;
      // the gate can reopen) skips values it thinks are already in place.
      last.current = new WeakMap();
      find('[data-part="c5-row"] [data-part="meter-used"]').forEach((el) => (el.textContent = meter.toUsed));
      find('[data-part="c5-row"] [data-part="meter-files"]').forEach((el) => (el.textContent = meter.toFiles));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
