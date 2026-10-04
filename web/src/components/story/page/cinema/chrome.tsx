'use client';

import { m, useScroll, useTransform } from 'framer-motion';
import { Download, Pause, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { DOWNLOAD_PATH } from '@/components/landing/links';
import { useMotionGate } from '../motion';
import { PAUSE_KEY } from '../pre-paint';
import { r2, seg } from './ease';

/**
 * The film's frame (docs/redesign/05-cinema.md §2): no header. One Download
 * pill, a scrubber along the bottom edge, and letterbox bars on desktop.
 */

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[#F2EDE8]';

/** Where the credits start: the pill steps aside there, and the bars come back. */
const CREDITS = 'start';

function togglePause() {
  const d = document.documentElement;
  const next = !d.hasAttribute('data-paused');
  if (next) d.setAttribute('data-paused', '');
  else d.removeAttribute('data-paused');
  try {
    localStorage.setItem(PAUSE_KEY, next ? '1' : '0');
  } catch {
    // Private windows: the choice holds for this visit only.
  }
}

/**
 * Download Virgo, the only persistent control. It arrives once the film has
 * started, steps aside while the visitor scrolls down fast, and returns when
 * they pause (~600 ms) or scroll up. Hidden over the credits, where Download is
 * inline. Never `inert`: a keyboard focus brings it back.
 */
export function DownloadPill() {
  const [shown, setShown] = useState(false);
  const [focused, setFocused] = useState(false);
  const gate = useMotionGate();

  useEffect(() => {
    let lastY = window.scrollY;
    let lastT = performance.now();
    let idle = 0;
    let credits = false;
    let away = false;

    const decide = () => setShown(!credits && window.scrollY > window.innerHeight * 0.6 && !away);
    const onScroll = () => {
      const y = window.scrollY;
      const t = performance.now();
      const v = (y - lastY) / Math.max(1, t - lastT);
      if (v > 1.1) away = true;
      else if (y < lastY - 4) away = false;
      lastY = y;
      lastT = t;
      decide();
      window.clearTimeout(idle);
      idle = window.setTimeout(() => {
        away = false;
        decide();
      }, 600);
    };
    const target = document.getElementById(CREDITS);
    const io = new IntersectionObserver(
      ([e]) => {
        // From the credits down (FAQ, footer), Download lives inline.
        credits = e.isIntersecting || e.boundingClientRect.top < 0;
        decide();
      },
      { threshold: 0 },
    );
    if (target) io.observe(target);
    decide();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.clearTimeout(idle);
      io.disconnect();
    };
  }, []);

  const visible = shown || focused;
  return (
    <div
      className={`fixed bottom-[calc(env(safe-area-inset-bottom)+18px)] left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-opacity lg:left-auto lg:right-6 lg:translate-x-0 ${visible ? 'opacity-100' : 'pointer-events-none translate-y-3 opacity-0 motion-reduce:translate-y-0'}`}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      {gate.motion && (
        <button
          type="button"
          onClick={togglePause}
          aria-pressed={gate.paused}
          aria-label="Pause motion"
          className={`grid size-11 place-items-center rounded-full border border-white/12 bg-[#161311]/80 text-[#BCADA3] shadow-[0_10px_30px_-12px_rgba(0,0,0,0.9)] backdrop-blur-md transition-colors hover:text-[#F2EDE8] ${FOCUS}`}
        >
          {gate.paused ? <Play aria-hidden className="size-4" /> : <Pause aria-hidden className="size-4" />}
        </button>
      )}
      <a
        href={DOWNLOAD_PATH}
        className={`inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full bg-[#F2EDE8] px-5 text-[15px] font-semibold text-[#161311] shadow-[0_14px_40px_-12px_rgba(0,0,0,0.85),0_0_0_1px_rgba(240,200,142,0.35)] transition-colors hover:bg-white ${FOCUS}`}
      >
        <Download aria-hidden className="size-4" />
        Download Virgo
      </a>
    </div>
  );
}

/** A 2 px timeline along the bottom edge, with a faint tick at every scene. */
export function Scrubber() {
  const { scrollYProgress } = useScroll();
  const transform = useTransform(scrollYProgress, (p) => `scaleX(${r2(p * 1000) / 1000})`);
  const [ticks, setTicks] = useState<number[]>([]);

  useEffect(() => {
    const measure = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (max <= 0) return;
      const marks = [...document.querySelectorAll<HTMLElement>('.story-page main > section[id]')]
        .map((s) => (s.getBoundingClientRect().top + window.scrollY) / max)
        .filter((x) => x > 0.001 && x < 0.999);
      setTicks(marks);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    return () => ro.disconnect();
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 bottom-0 z-50 h-[2px] bg-white/[0.06]">
      <m.div style={{ transform }} className="h-full origin-left bg-gradient-to-r from-[#A85F38] via-[#D18A5A] to-[#F0C88E]" />
      {ticks.map((t, i) => (
        <span key={i} className="absolute top-0 h-full w-px bg-white/25" style={{ left: `${r2(t * 100)}%` }} />
      ))}
    </div>
  );
}

/**
 * Letterbox bars (desktop ≥ 1024 px, motion on): the film opens in 2.39:1,
 * the bars retract as the first scroll starts, and return for the credits.
 */
export function Letterbox() {
  const gate = useMotionGate();
  const { scrollY } = useScroll();
  const credits = useRef({ top: Infinity, bottom: Infinity });
  const [on, setOn] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const measure = () => {
      setOn(mq.matches);
      const el = document.getElementById(CREDITS);
      if (!el) return;
      const r = el.getBoundingClientRect();
      credits.current = { top: r.top + window.scrollY, bottom: r.bottom + window.scrollY };
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    mq.addEventListener('change', measure);
    return () => {
      ro.disconnect();
      mq.removeEventListener('change', measure);
    };
  }, []);

  const scale = useTransform(scrollY, (y) => {
    if (typeof window === 'undefined') return 'scaleY(1)';
    const h = window.innerHeight;
    const opening = 1 - seg(y, h * 0.04, h * 0.45);
    const c = credits.current;
    const closing = seg(y + h, c.top + h * 0.2, c.top + h * 0.8) * (1 - seg(y, c.bottom - h * 0.6, c.bottom - h * 0.1));
    return `scaleY(${r2(Math.max(opening, closing))})`;
  });

  if (!gate.motion || !on) return null;
  const bar = 'pointer-events-none fixed inset-x-0 z-[45] h-[min(11vh,max(0px,calc((100vh_-_100vw/2.39)/2)))] bg-[#090807]';
  return (
    <>
      <m.div aria-hidden style={{ transform: scale }} className={`${bar} top-0 origin-top`} />
      <m.div aria-hidden style={{ transform: scale }} className={`${bar} bottom-0 origin-bottom`} />
    </>
  );
}
