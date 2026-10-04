'use client';

import { useMotionValueEvent } from 'framer-motion';
import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { CLIENT_ANNOUNCE, CLIENT_PAGE } from '../../data/strings/ch6';
import { CH6_DEMO } from '../../data/strings/page-ch6';
import { useChapterProgress, useMotionGate } from '../motion';

/**
 * Ch6 · The Handover — the island (storyboard §2 Ch6, §1.13).
 *
 * Enhances the server-rendered sticky figure in place: every frame writes
 * transform/opacity onto `[data-part]` elements, and discrete beats flip the
 * mocks' own `data-on` / `data-state` attributes. No React state per frame.
 * Static readers (reduced motion, no JS, short screens) never run any of it.
 */

const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** 0 → 1 across [a, b]. */
const seg = (p: number, a: number, b: number) => clamp((p - a) / (b - a));
/** The enter curve, cubic-bezier(0.16, 1, 0.3, 1), close enough for scroll. */
const out = (t: number) => 1 - Math.pow(1 - t, 4);
const inOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const r = (n: number) => Math.round(n * 100) / 100;

type Els = {
  root: HTMLElement;
  q: (name: string) => HTMLElement | null;
};

function style(el: HTMLElement | null, transform: string | null, opacity?: number) {
  if (!el) return;
  if (transform !== null) el.style.transform = transform;
  if (opacity !== undefined) el.style.opacity = String(r(opacity));
}

function flag(el: Element | null | undefined, attr: string, yes: boolean) {
  if (!el) return;
  if (yes) el.setAttribute(attr, '');
  else el.removeAttribute(attr);
}

/** The beats both layouts share, as discrete flips. */
function beats(els: Els, p: number, wide: boolean) {
  const { root } = els;
  // The Sunday client page: picks from 0.50, sent from 0.60.
  const picked = p >= 0.5;
  const sent = p >= 0.6;
  root.querySelectorAll<HTMLElement>('[data-c6-layer="sunday"]').forEach((layer) => {
    layer.querySelectorAll('[data-c6-pick]').forEach((t) => flag(t, 'data-picked', picked));
    layer.querySelectorAll('[data-c6-heart]').forEach((h) => flag(h, 'data-on', picked));
    flag(layer.querySelector('[data-part="picks-bar"]'), 'data-on', picked);
    layer.querySelector('[data-part="my-picks"]')?.setAttribute('data-state', picked ? 'some' : 'none');
    layer.querySelector('[data-part="send"]')?.setAttribute('data-state', sent ? 'sent' : 'unsent');
    // The couple scroll down to the photos as the page opens.
    const scroll = layer.querySelector<HTMLElement>('[data-part="client-scroll"]');
    if (scroll) scroll.style.transform = `translateY(${r(-out(seg(p, 0.38, 0.47)) * (wide ? 150 : 290))}px)`;
    // Tiles sharpen in a stagger: an opacity crossfade over pre-blurred plates.
    layer.querySelectorAll<HTMLElement>('[data-part="tile-sharp"]').forEach((t, i) => {
      t.style.opacity = String(r(out(seg(p, 0.36 + i * 0.014, 0.41 + i * 0.014))));
    });
  });

  // Three weeks later the page opens on its kind tabs.
  root.querySelectorAll<HTMLElement>('[data-c6-layer="later"] [data-part="client-scroll"]').forEach((el) => {
    el.style.transform = `translateY(${wide ? -150 : -280}px)`;
  });

  // The web dialog: Photos only → the link → films and audio ticked → up to date.
  const dialog = els.q('c6-dialog');
  if (dialog) {
    const linked = p >= 0.15;
    const widened = p >= 0.73;
    const updated = p >= 0.8;
    flag(dialog.querySelector('[data-part="kind-video"]'), 'data-on', widened);
    flag(dialog.querySelector('[data-part="kind-audio"]'), 'data-on', widened);
    flag(dialog.querySelector('[data-part="link-field"]'), 'data-on', linked);
    flag(dialog.querySelector('[data-part="revoke"]'), 'data-on', linked);
    dialog
      .querySelector('[data-part="cta"]')
      ?.setAttribute('data-state', !linked ? 'generate' : widened && !updated ? 'update' : 'uptodate');
  }

  // The phone sheet three weeks later: Photos only, then Films and Audio.
  const later = els.q('m6-sheet-later');
  if (later) {
    flag(later.querySelector('[data-part="row-video"]'), 'data-on', p >= 0.72);
    flag(later.querySelector('[data-part="row-audio"]'), 'data-on', p >= 0.745);
  }
}

function desktop(els: Els, p: number) {
  const { q } = els;
  // 0.00–0.20 · the album card folds into the link; the title card; the dialog.
  const fold = seg(p, 0.0, 0.08);
  style(q('c6-fold'), `perspective(900px) rotateX(${r(fold * 78)}deg) translateZ(${r(-fold * 60)}px)`, 1 - fold);
  style(q('c6-titlecard'), `translateY(${r(-seg(p, 0.06, 0.12) * 16)}px)`, 1 - seg(p, 0.07, 0.12));
  const urlIn = out(seg(p, 0.02, 0.09));
  const urlOut = inOut(seg(p, 0.19, 0.27));
  style(q('c6-url'), `translate3d(0, ${r((1 - urlIn) * 18)}px, 0) scale(${r(0.92 + urlIn * 0.08 + urlOut * 0.5)})`, urlIn * (1 - urlOut));

  const ownerIn = out(seg(p, 0.07, 0.15));
  const ownerAway = inOut(seg(p, 0.22, 0.3));
  const ownerBack = out(seg(p, 0.67, 0.74));
  const ownerOff = inOut(seg(p, 0.84, 0.92));
  const away = ownerAway * (1 - ownerBack);
  const ownerOpacity = Math.min(ownerIn, 1 - away) * (1 - ownerOff);
  style(
    q('c6-owner'),
    `translate3d(${r(-away * 8 - ownerOff * 6)}%, ${r((1 - ownerIn) * 28)}px, ${r(-away * 220 - ownerOff * 120)}px) rotateY(${r(14 - ownerIn * 8 + away * 4)}deg) rotateX(${r(4 + (1 - ownerIn) * 6)}deg)`,
    ownerOpacity,
  );

  // 0.20–0.30 · the link leaves as a streak of light, out of depth toward the couple's phone.
  const streak = seg(p, 0.19, 0.31);
  style(
    q('c6-streak'),
    `translate3d(${r(-30 + streak * 60)}%, ${r(-14 + streak * 22)}%, ${r(-260 + streak * 360)}px) scale(${r(0.6 + streak * 0.7)})`,
    Math.sin(streak * Math.PI),
  );

  // 0.26–0.36 · the couple's phone turns to face you as it opens.
  const phoneIn = out(seg(p, 0.25, 0.37));
  const aside = inOut(seg(p, 0.66, 0.73)) * (1 - inOut(seg(p, 0.84, 0.92)));
  style(
    q('c6-couple'),
    `translate3d(${r(aside * 45)}%, ${r((1 - phoneIn) * 40)}px, ${r(-(1 - phoneIn) * 180 - aside * 70)}px) rotateY(${r(-(1 - phoneIn) * 16 - aside * 10)}deg) rotateX(${r((1 - phoneIn) * 8 + 2)}deg)`,
    phoneIn,
  );
  style(q('c6-later'), null, out(seg(p, 0.83, 0.9)));

  // 0.60–0.68 · Mika's card drops in, in front.
  const notice = out(seg(p, 0.6, 0.65)) * (1 - inOut(seg(p, 0.69, 0.73)));
  style(q('c6-notice'), `translate3d(0, ${r((1 - notice) * -20)}px, ${r(notice * 40)}px)`, notice);

  // 0.68–0.92 · Three weeks later, and the same link.
  const later = out(seg(p, 0.66, 0.71)) * (1 - seg(p, 0.9, 0.95));
  style(q('c6-later-chip'), `translateY(${r((1 - later) * 12)}px)`, later);
  const same = out(seg(p, 0.77, 0.83)) * (1 - seg(p, 0.93, 0.98));
  style(q('c6-same'), `translateY(${r((1 - same) * 14)}px)`, same);
}

function mobile(els: Els, p: number) {
  const { q } = els;
  // The phone is the figure: it tilts a little as the screens change (≤ 10°).
  const turn = Math.sin(seg(p, 0, 1) * Math.PI * 2);
  style(q('[data-part="m6-phone"] [data-part="slab-body"]'), `rotateX(${r(3 + turn * 2)}deg) rotateY(${r(-6 + turn * 4)}deg)`);

  // The link rises out of the alert and leaves as a streak.
  const urlIn = out(seg(p, 0.17, 0.21));
  const urlOut = inOut(seg(p, 0.23, 0.29));
  style(q('m6-url'), `translateY(${r((1 - urlIn) * 14 - urlOut * 60)}px) scale(${r(1 + urlOut * 0.12)})`, urlIn * (1 - urlOut));

  // Screens, back to front: owner (Sunday) → alert → client page → owner (later) → alert → client page (later).
  const owner1 = 1 - seg(p, 0.24, 0.29);
  style(q('m6-owner'), null, owner1);
  style(q('[data-part="m6-sheet"] [data-part="sheet"]'), `translateY(${r((1 - out(seg(p, 0.02, 0.1))) * 100)}%)`);
  style(q('[data-part="m6-sheet"] [data-part="sheet-shade"]'), null, seg(p, 0.01, 0.06));
  style(q('m6-sheet'), null, 1 - seg(p, 0.12, 0.16));
  style(q('m6-alert'), `scale(${r(1.06 - out(seg(p, 0.13, 0.17)) * 0.06)})`, seg(p, 0.13, 0.17) * (1 - seg(p, 0.22, 0.26)));
  style(q('m6-sunday'), null, seg(p, 0.25, 0.3));
  const owner2 = seg(p, 0.67, 0.7) * (1 - seg(p, 0.83, 0.87));
  style(q('m6-owner-later'), null, owner2);
  style(q('[data-part="m6-sheet-later"] [data-part="sheet"]'), `translateY(${r((1 - out(seg(p, 0.67, 0.71))) * 100)}%)`);
  style(q('m6-sheet-later'), null, 1 - seg(p, 0.765, 0.78));
  style(q('m6-alert-later'), null, seg(p, 0.765, 0.79));
  style(q('m6-later'), null, seg(p, 0.84, 0.89));

  // The streak: a short travel up and out of the phone (≤ 40 %).
  const streak = seg(p, 0.22, 0.31);
  style(q('m6-streak'), `translate3d(${r(-20 + streak * 40)}%, ${r(10 - streak * 30)}%, 0) scale(${r(0.7 + streak * 0.4)})`, Math.sin(streak * Math.PI));

  const notice = out(seg(p, 0.6, 0.64)) * (1 - seg(p, 0.66, 0.69));
  style(q('m6-notice'), `translateY(${r((1 - notice) * -16)}px)`, notice);
  const later = out(seg(p, 0.66, 0.7)) * (1 - seg(p, 0.92, 0.97));
  style(q('m6-later-chip'), `translateY(${r((1 - later) * 10)}px)`, later);
}

/** Wraps the chapter's track. Static readers get the server render untouched. */
export function Ch6Stage({ children, className = '' }: { children: ReactNode; className?: string }) {
  const { motion } = useMotionGate();
  const ref = useRef<HTMLDivElement>(null);
  const progress = useChapterProgress(ref, 'track');
  const els = useRef<Els | null>(null);
  const wide = useRef(true);

  const apply = (p: number) => {
    const e = els.current;
    if (!e) return;
    beats(e, p, wide.current);
    if (wide.current) desktop(e, p);
    else mobile(e, p);
  };

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root || !motion) return;
    const cache = new Map<string, HTMLElement | null>();
    els.current = {
      root,
      q: (name) => {
        if (!cache.has(name)) cache.set(name, root.querySelector<HTMLElement>(name.startsWith('[') ? name : `[data-part="${name}"]`));
        return cache.get(name) ?? null;
      },
    };
    // Remember which tiles the couple picks: the server drew the final frame.
    root.querySelectorAll('[data-c6-layer="sunday"] [data-part="tile"][data-picked]').forEach((t) => t.setAttribute('data-c6-pick', ''));
    root.querySelectorAll('[data-c6-layer="sunday"] [data-part="heart"][data-on]').forEach((h) => h.setAttribute('data-c6-heart', ''));
    const onResize = () => {
      wide.current = window.innerWidth >= 1024;
      apply(progress.get());
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      // Back to the server's frame if the gate closes (OS setting flipped).
      if (els.current) beats(els.current, 1, wide.current);
      els.current = null;
      root.querySelectorAll<HTMLElement>('[data-part]').forEach((el) => {
        if (el.dataset.part?.startsWith('c6-') || el.dataset.part?.startsWith('m6-') || el.dataset.part === 'tile-sharp') {
          el.style.transform = '';
          el.style.opacity = '';
        }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motion]);

  useMotionValueEvent(progress, 'change', apply);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

// ─── Try the hearts ──────────────────────────────────────────────────────

/**
 * Six photos with real heart buttons, the picks bar and Send to
 * photographer, as the client page has them. Announces what the page's own
 * live region says. No network: nothing leaves the page. Works without motion.
 */
export function HeartsDemo({ plates }: { plates: ReactNode[] }) {
  const [picked, setPicked] = useState<boolean[]>(() => plates.map(() => false));
  // The source of truth between renders, so quick taps never read a stale list.
  const latest = useRef(picked);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState('');
  const id = useId();
  const count = picked.filter(Boolean).length;

  const toggle = (i: number) => {
    const next = latest.current.slice();
    next[i] = !next[i];
    latest.current = next;
    const n = next.filter(Boolean).length;
    setPicked(next);
    if (n === 0) setSent(false);
    setMessage(`${next[i] ? CLIENT_ANNOUNCE.picked : CLIENT_ANNOUNCE.removed}${n}${CLIENT_ANNOUNCE.inAll}`);
  };

  const send = () => {
    const n = latest.current.filter(Boolean).length;
    if (n === 0) return;
    setSent(true);
    // The page's own sentence, with the real count.
    setMessage(`${CH6_DEMO.sentBefore}${n}${CH6_DEMO.sentAfter}`);
  };

  return (
    <div className="mt-8">
      <ul role="list" className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
        {plates.map((plate, i) => {
          const on = picked[i];
          return (
            <li key={i} className="relative">
              <div
                className={`relative overflow-hidden rounded-[14px] transition-transform duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] ${on ? 'scale-[0.97]' : ''}`}
              >
                {plate}
                <span
                  aria-hidden
                  className={`pointer-events-none absolute inset-0 rounded-[14px] shadow-[inset_0_0_0_3px_#A85D35] transition-opacity duration-200 ${on ? 'opacity-100' : 'opacity-0'}`}
                />
              </div>
              <button
                type="button"
                aria-pressed={on}
                aria-label={`${CLIENT_ANNOUNCE.pick}${CH6_DEMO.photo}${i + 1}`}
                onClick={() => toggle(i)}
                className={`absolute right-2 top-2 grid size-11 place-items-center rounded-full shadow-[0_1px_4px_rgba(0,0,0,0.2)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#1E1B18] ${
                  on ? 'bg-white text-[#A85D35]' : 'bg-[rgba(255,255,255,0.9)] text-[#3B322C]'
                }`}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
                  <path
                    d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.1 4.3 2.4h2c.7-1.3 2.2-2.4 4.3-2.4 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21Z"
                    className={on ? 'fill-current' : 'fill-none'}
                    stroke="currentColor"
                    strokeWidth={1.9}
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-5 flex flex-wrap items-center gap-3 rounded-full bg-[#211D1A] py-2 pl-4 pr-2 text-white shadow-[0_22px_60px_-24px_rgba(40,24,16,0.7)] sm:w-max">
        <p className="flex items-center gap-2 font-semibold" id={`${id}-count`}>
          <b className="grid h-7 min-w-7 place-items-center rounded-full bg-[#E0A97C] px-2 font-mono text-[13px] text-[#211D1A] tabular-nums">
            {count}
          </b>
          <span>{count === 0 ? CH6_DEMO.none : CLIENT_PAGE.picked}</span>
        </p>
        <span className="flex-1" />
        <button
          type="button"
          onClick={send}
          aria-disabled={count === 0}
          aria-describedby={`${id}-count`}
          className="inline-flex min-h-11 items-center rounded-full bg-[#E0A97C] px-5 text-[15px] font-semibold text-[#211D1A] transition-opacity aria-disabled:opacity-55 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-white"
        >
          {sent ? CLIENT_PAGE.sendAgain : CLIENT_PAGE.send}
        </button>
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {message}
      </p>
    </div>
  );
}
