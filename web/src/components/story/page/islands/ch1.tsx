'use client';

import { useScroll } from 'framer-motion';
import { useEffect, useRef, type ReactNode } from 'react';
import { useMotionGate } from '../motion';

/**
 * Ch1's stage (storyboard Ch1, §1.13): the phone stands in 3D while the
 * chats pile up and fan back in depth, the screen freezes, then the phone
 * eases flat and the Post a job form fills in as you scroll, until "Post it"
 * presses and the stamp lands.
 *
 * Enhances the server-rendered figure in place: it writes transform and
 * opacity on the mocks' `[data-part]`s, flips `data-on` / `hidden` for the
 * form's discrete beats, and writes the lock clock as a counter. Nothing
 * re-renders on scroll. With the motion gate closed it renders its children
 * untouched.
 *
 * Progress runs from when the phone pins (the top of the track on desktop,
 * the phone reaching the header on phones) to when the track's foot reaches
 * the bottom of the screen.
 */

export type PileGeometry = {
  peek: number;
  depth: number;
  twist: readonly number[];
  nudge: readonly number[];
  fog: number;
  fogMax: number;
};

export type Ch1Config = {
  pile: PileGeometry;
  /** The lock clock for 0…n cards landed, per deck size. */
  clocks: Record<'5' | '7', readonly string[]>;
  /** The roles Mika picks, as part slugs, in order. */
  roles: readonly string[];
};

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ss = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** cubic-bezier(0.16, 1, 0.3, 1), near enough: an ease-out expo. */
const enter = (t: number) => (t >= 1 ? 1 : t <= 0 ? 0 : 1 - Math.pow(2, -10 * t));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (x: number) => Math.round(x * 100) / 100;

/** Arrivals tighten from 8% to 2% of progress (desktop deck), 9% to 3% (phones). */
const ARRIVE: Record<'5' | '7', readonly number[]> = {
  '7': [0.1, 0.18, 0.248, 0.304, 0.348, 0.38, 0.4],
  '5': [0.1, 0.19, 0.26, 0.31, 0.34],
};
const LAND = 0.035;

type Writer = (p: number) => void;

/** Writes a style property only when it changes. */
function writer(el: HTMLElement | null) {
  let t = '';
  let o = '';
  // The server's rest pose, put back if the story stops moving.
  const t0 = el?.style.transform ?? '';
  const o0 = el?.style.opacity ?? '';
  return {
    el,
    restore() {
      if (!el) return;
      el.style.transform = t0;
      el.style.opacity = o0;
      t = '';
      o = '';
    },
    set(transform: string | null, opacity: number | null) {
      if (!el) return;
      if (transform !== null && transform !== t) {
        el.style.transform = transform;
        t = transform;
      }
      if (opacity !== null) {
        const v = String(r2(opacity));
        if (v !== o) {
          el.style.opacity = v;
          o = v;
        }
      }
    },
  };
}

/** One phone rig: the pile, the freeze, the form, the slab. */
function rig(root: HTMLElement, config: Ch1Config): { apply: Writer; reset: () => void } {
  const q = <T extends HTMLElement = HTMLElement>(name: string) => root.querySelector<T>(`[data-part="${name}"]`);
  const deck = (root.getAttribute('data-deck') === '5' ? '5' : '7') as '5' | '7';
  const mobile = deck === '5';
  const arrive = ARRIVE[deck];
  const n = arrive.length;
  const { pile } = config;
  const cards = Array.from({ length: n }, (_, i) => ({ card: writer(q(`chat-card-${i + 1}`)), fog: writer(q(`chat-card-${i + 1}-fog`)) }));
  const freeze = writer(q('freeze'));
  const formLayer = writer(q('form-layer'));
  const body = writer(q('slab-body'));
  const sheenA = writer(q('slab-sheen-a'));
  const sheenB = writer(q('slab-sheen-b'));
  const bigClock = writer(q('big-clock'));
  const lockTime = q('lock-time');
  const statusTime = q('status-time');
  const scroll = writer(q('job-scroll'));
  const column = writer(q('job-column'));
  const fades = (names: string[]) => names.map((name) => writer(q(name)));
  const topValues = fades(['title-value', 'date-value', 'date-clear', 'where-value']);
  const topHolders = fades(['title-placeholder', 'date-empty', 'where-placeholder']);
  const chips = config.roles.map((slug) => q(`role-${slug}`));
  const budgets = q('budgets');
  const budgetValues = config.roles.flatMap((slug) => [
    { value: writer(q(`budget-${slug}-min-value`)), holder: writer(q(`budget-${slug}-min-placeholder`)) },
    { value: writer(q(`budget-${slug}-max-value`)), holder: writer(q(`budget-${slug}-max-placeholder`)) },
  ]);
  const briefValue = writer(q('brief-value'));
  const briefHolder = writer(q('brief-placeholder'));
  const briefHint = q('brief-hint');
  const briefCount = q('brief-count');
  const button = writer(q('post-button'));
  const needsAll = writer(q('helper-needs-all'));
  const needsBrief = writer(q('helper-needs-brief'));
  const ready = writer(q('helper-ready'));
  const stamp = writer(q('posted-stamp'));
  const star = writer(q('post-star'));
  let clock = '';

  const pose = (k: number) => {
    const f = Math.min(Math.floor(k), pile.twist.length - 1);
    const c = Math.min(f + 1, pile.twist.length - 1);
    const t = k - Math.floor(k);
    return {
      x: lerp(pile.nudge[f], pile.nudge[c], t),
      y: -k * pile.peek,
      z: -k * pile.depth,
      r: lerp(pile.twist[f], pile.twist[c], t),
      fog: Math.min(pile.fogMax, k * pile.fog),
    };
  };

  const apply: Writer = (p) => {
    // ── The pile: each card lands, then steps back as newer ones arrive.
    const landed = arrive.map((a) => enter(clamp01((p - a) / LAND)));
    let count = 0;
    for (let i = 0; i < n; i++) {
      const a = landed[i];
      if (a >= 0.5) count = i + 1;
      let k = 0;
      for (let j = i + 1; j < n; j++) k += landed[j];
      const at = pose(k);
      const x = lerp(0, at.x, a);
      const y = lerp(56, at.y, a);
      const z = lerp(80, at.z, a);
      const r = lerp(0, at.r, a);
      cards[i].card.set(`translate3d(${r2(x)}px, ${r2(y)}px, ${r2(z)}px) rotate(${r2(r)}deg)`, Math.min(1, a * 1.8));
      cards[i].fog.set(null, at.fog * a);
    }
    const next = config.clocks[deck][count] ?? '';
    if (next && next !== clock) {
      clock = next;
      if (lockTime) lockTime.textContent = next;
      if (statusTime) statusTime.textContent = next;
    }

    // ── The freeze, then the form slides up over the pile.
    const wipe = enter(clamp01((p - 0.56) / 0.08));
    freeze.set(null, 0.6 * ss(0.46, 0.54, p) * (1 - ss(0.6, 0.66, p)));
    formLayer.set(`translate3d(0, ${r2((1 - wipe) * 102)}%, 0)`, Math.min(1, wipe * 2));

    // ── The slab: standing turned while the chats pile up, flat to face you for the form.
    const max = mobile ? 7 : 14;
    const settle = ss(0.46, 0.6, p);
    const done = ss(0.92, 1, p);
    const rotY = lerp(lerp(-max, -max * 0.55, ss(0, 0.45, p)), 0, settle) + done * (mobile ? 3 : 6);
    const rotX = lerp(mobile ? 5 : 7, 0, settle) + done * 2;
    const lift = (mobile ? 10 : 24) * done;
    body.set(`rotateX(${r2(rotX)}deg) rotateY(${r2(rotY)}deg) translateZ(${r2(lift)}px)`, null);
    const sa = 0.5 - (Math.max(-18, Math.min(18, rotY)) / 18) * 0.5;
    sheenA.set(null, sa);
    sheenB.set(null, 1 - sa);
    bigClock.set(`translate3d(0, ${r2(-40 * p)}px, 0)`, 0.14 * ss(0, 0.08, p) * (1 - ss(0.5, 0.6, p)));

    // ── The form fills: title, date and place; then the roles, one by one; budgets; the brief.
    const top = ss(0.62, 0.65, p);
    for (const w of topValues) w.set(null, top);
    for (const w of topHolders) w.set(null, 1 - top);
    let anyRole = false;
    chips.forEach((chip, i) => {
      const on = p >= 0.635 + i * 0.014;
      anyRole ||= on;
      if (!chip) return;
      if (on !== chip.hasAttribute('data-on')) chip.toggleAttribute('data-on', on);
    });
    if (budgets && budgets.hidden === anyRole) budgets.hidden = !anyRole;
    budgetValues.forEach(({ value, holder }, i) => {
      const t = ss(0.715 + i * 0.012, 0.73 + i * 0.012, p);
      value.set(null, t);
      holder.set(null, 1 - t);
    });
    const brief = ss(0.83, 0.855, p);
    briefValue.set(null, brief);
    briefHolder.set(null, 1 - brief);
    const counted = p >= 0.85;
    if (briefHint && briefHint.hidden !== counted) briefHint.hidden = counted;
    if (briefCount && briefCount.hidden === counted) briefCount.hidden = !counted;

    // The form scrolls itself (two transforms): to the roles, the budgets, then the foot.
    const s = lerp(lerp(lerp(0, 0.14, ss(0.64, 0.68, p)), 0.86, ss(0.69, 0.74, p)), 1, ss(0.8, 0.84, p));
    scroll.set(`translateY(${r2(s * 100)}%)`, null);
    column.set(`translateY(-${r2(s * 100)}%)`, null);

    // Ready, press, stamp, and the post rises as a star.
    const isReady = ss(0.855, 0.87, p);
    const press = p > 0.895 && p < 0.915 ? 1 - Math.abs(p - 0.905) / 0.01 : 0;
    button.set(`scale(${r2(1 - 0.03 * press)})`, 0.4 + 0.6 * isReady);
    needsAll.set(null, 1 - ss(0.62, 0.64, p));
    needsBrief.set(null, ss(0.62, 0.64, p) * (1 - isReady));
    ready.set(null, isReady);
    const st = enter(clamp01((p - 0.905) / 0.05));
    stamp.set(`scale(${r2(1.5 - 0.5 * st)})`, st);
    const rise = clamp01((p - 0.93) / 0.07);
    star.set(`translate3d(0, ${r2(-rise * (mobile ? 120 : 220))}px, 0) scale(${r2(0.6 + 0.6 * enter(rise))})`, rise > 0 ? Math.sin(Math.PI * Math.min(1, rise * 1.1)) : 0);
  };

  const all = [
    ...cards.flatMap((c) => [c.card, c.fog]),
    freeze,
    formLayer,
    body,
    sheenA,
    sheenB,
    bigClock,
    scroll,
    column,
    ...topValues,
    ...topHolders,
    ...budgetValues.flatMap((b) => [b.value, b.holder]),
    briefValue,
    briefHolder,
    button,
    needsAll,
    needsBrief,
    ready,
    stamp,
    star,
  ];
  const initial = {
    clock: lockTime?.textContent ?? '',
    status: statusTime?.textContent ?? '',
    chips: chips.map((c) => c?.hasAttribute('data-on') ?? false),
    budgets: budgets?.hidden ?? false,
    hint: briefHint?.hidden ?? false,
    count: briefCount?.hidden ?? false,
  };
  const reset = () => {
    for (const w of all) w.restore();
    if (lockTime) lockTime.textContent = initial.clock;
    if (statusTime) statusTime.textContent = initial.status;
    chips.forEach((c, i) => c?.toggleAttribute('data-on', initial.chips[i]));
    if (budgets) budgets.hidden = initial.budgets;
    if (briefHint) briefHint.hidden = initial.hint;
    if (briefCount) briefCount.hidden = initial.count;
  };
  return { apply, reset };
}

export function Ch1Stage({ children, className = '', config }: { children: ReactNode; className?: string; config: Ch1Config }) {
  const root = useRef<HTMLDivElement>(null);
  const gate = useMotionGate();
  const { scrollY } = useScroll();

  useEffect(() => {
    const el = root.current;
    if (!gate.motion || !el) return;
    const rigs = [...el.querySelectorAll<HTMLElement>('[data-rig]')].map((r) => rig(r, config));
    const marks = [1, 2, 3].map((i) => writer(el.querySelector<HTMLElement>(`[data-part="step-mark-${i}"]`)));
    const intro = el.querySelector<HTMLElement>('[data-part="ch1-intro"]');

    // Progress is pinned to the copy: each beat plays as the line that names it
    // reaches the reader's eye line (the middle of the screen on desktop, the
    // middle of the strip under the phone on phones), so words and phone stay
    // in step at any size.
    const anchors: { y: number; p: number }[] = [];
    const pinned = [...el.querySelectorAll<HTMLElement>('[data-sticky]')];
    const measure = () => {
      // Measure where the copy sits in the flow, not where a pinned card happens to be held.
      for (const node of pinned) {
        node.style.position = 'static';
        node.style.top = 'auto';
      }
      measureFlow();
      for (const node of pinned) {
        node.style.position = '';
        node.style.top = '';
      }
    };
    const measureFlow = () => {
      const V = window.innerHeight;
      const desktop = window.innerWidth >= 1024;
      const top = el.getBoundingClientRect().top + window.scrollY;
      const eye = desktop ? V * 0.5 : 56 + 0.54 * V + (V - 56 - 0.54 * V) * 0.45;
      // Phones: from the phone pinning under the 56 px header. Desktop: from the top of the track.
      const start = desktop || !intro ? top : top + intro.offsetTop + intro.offsetHeight - 56;
      const end = Math.max(start + 1, top + el.offsetHeight - V);
      const at = (name: string) => {
        const node = el.querySelector<HTMLElement>(`[data-part="${name}"]`);
        if (!node) return null;
        const r = node.getBoundingClientRect();
        return r.top + window.scrollY + Math.min(r.height / 2, 60) - eye;
      };
      const keys: [string, number][] = [
        ['ch1-step-1', 0.1],
        ['ch1-step-2', 0.3],
        ['ch1-step-3', 0.4],
        ['ch1-pull', 0.5],
        ['ch1-turn', 0.62],
      ];
      anchors.length = 0;
      anchors.push({ y: start, p: 0 });
      for (const [name, p] of keys) {
        const y = at(name);
        const prev = anchors[anchors.length - 1];
        if (y !== null && y > prev.y + 1 && y < end - 1) anchors.push({ y, p });
      }
      anchors.push({ y: Math.max(end, anchors[anchors.length - 1].y + 1), p: 1 });
    };
    const progressAt = (y: number) => {
      if (y <= anchors[0].y) return 0;
      for (let i = 1; i < anchors.length; i++) {
        const a = anchors[i - 1];
        const b = anchors[i];
        if (y <= b.y) return a.p + ((y - a.y) / (b.y - a.y)) * (b.p - a.p);
      }
      return 1;
    };
    let last = -1;
    const apply = (y: number) => {
      const p = clamp01(progressAt(y));
      if (Math.abs(p - last) < 0.0003) return;
      last = p;
      for (const r of rigs) r.apply(p);
      // Step 1's three time lines light in turn, with the cards they name.
      const on = [ss(0.08, 0.12, p), ss(0.29, 0.33, p), ss(0.38, 0.42, p)];
      marks.forEach((m, i) => m.set(`scaleY(${r2(on[i])})`, on[i]));
    };
    measure();
    apply(scrollY.get());
    const off = scrollY.on('change', apply);
    const ro = new ResizeObserver(() => {
      measure();
      last = -1;
      apply(scrollY.get());
    });
    ro.observe(el);
    return () => {
      off();
      ro.disconnect();
      for (const r of rigs) r.reset();
      for (const m of marks) m.restore();
    };
  }, [gate.motion, scrollY, config]);

  return (
    <div ref={root} className={className}>
      {children}
    </div>
  );
}
