'use client';

import { m, useMotionValueEvent, useScroll, useTransform, type MotionValue } from 'framer-motion';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { hud } from './hud';
import { useChapterProgress } from '../motion';
import { r2, window4 } from './ease';

/**
 * A pinned shot (docs/redesign/05-cinema.md §1): `length` svh of scroll during
 * which a full-viewport stage holds still and the children animate from the
 * shot's progress (0 → 1). The camera should always be moving inside it.
 */
export function Shot({
  length = 120,
  overlap = false,
  className = '',
  children,
}: {
  /** Scroll distance in svh, beyond the 100svh the stage itself takes. */
  length?: number;
  /**
   * The chapter overlaps the one before by a screen (no cut between them):
   * the stage stays unseen while it slides in over the previous scene, and
   * appears the instant it pins, which is the instant that scene ends. No
   * dead scroll between two scenes that share the sky.
   */
  overlap?: boolean;
  className?: string;
  children: (progress: MotionValue<number>) => ReactNode;
}) {
  const track = useRef<HTMLDivElement>(null);
  const progress = useChapterProgress(track, 'track');
  // The raw position, not the glide: the stage must appear exactly as it pins.
  const { scrollYProgress } = useScroll({ target: track, offset: ['start start', 'end end'] });
  const visibility = useTransform(scrollYProgress, (p) => (!overlap || p > 0 ? 'visible' : 'hidden'));
  return (
    <div ref={track} className="relative" style={{ height: `${100 + length}svh` }}>
      <m.div style={{ visibility }} className={`sticky top-0 h-svh overflow-clip ${className}`}>
        {children(progress)}
      </m.div>
    </div>
  );
}

export type Line = { text: string; from: number; to: number; small?: string };

/**
 * Subtitles: one line on screen at a time, lower third, large, over a soft
 * scrim, with an optional small supporting line. Real text.
 */
export function Subtitles({
  progress,
  lines,
  tone = 'night',
  className = '',
}: {
  progress: MotionValue<number>;
  lines: readonly Line[];
  tone?: 'night' | 'day';
  className?: string;
}) {
  return (
    <div className={`pointer-events-none absolute inset-x-0 bottom-[16svh] z-30 flex justify-center px-5 sm:bottom-[14svh] lg:bottom-[7svh] ${className}`}>
      <div className="relative grid w-full max-w-4xl place-items-center text-center">
        {lines.map((line, i) => (
          <SubtitleLine key={i} progress={progress} line={line} tone={tone} />
        ))}
      </div>
    </div>
  );
}

function SubtitleLine({ progress, line, tone }: { progress: MotionValue<number>; line: Line; tone: 'night' | 'day' }) {
  const span = line.to - line.from;
  const fade = Math.min(0.08, span / 4);
  const o = useTransform(progress, (p) => window4(p, line.from, line.from + fade, line.to - fade, line.to));
  const t = useTransform(o, (v) => `translate3d(0,${r2((1 - v) * 18)}px,0)`);
  const ink = tone === 'day' ? 'text-[#1E1B18]' : 'text-[#F2EDE8]';
  const scrim = tone === 'day' ? 'bg-[radial-gradient(closest-side,rgba(251,247,242,0.9),rgba(251,247,242,0))]' : 'bg-[radial-gradient(closest-side,rgba(22,19,17,0.85),rgba(22,19,17,0))]';
  return (
    <m.div style={{ opacity: o, transform: t }} className="col-start-1 row-start-1 px-6 py-5 will-change-transform">
      <div aria-hidden className={`absolute -inset-x-8 -inset-y-6 -z-10 ${scrim}`} />
      <p className={`story-display text-balance text-[clamp(1.85rem,1.1rem+3.4vw,2.75rem)] lg:text-[clamp(2.3rem,1rem+2.2vw,3.3rem)] font-semibold leading-[1.08] tracking-[-0.025em] ${ink}`}>{line.text}</p>
      {line.small && <p className={`mt-3 text-pretty text-[15px] sm:text-[17px] ${tone === 'day' ? 'text-[#54433C]' : 'text-[#BCADA3]'}`}>{line.small}</p>}
    </m.div>
  );
}

/**
 * The scene slate (the time card). It is shown on the frame, bottom left, by
 * the film's HUD (frame.tsx), not inside the scene: each slate here only
 * tells the HUD when it is the current one. Renders nothing.
 */
export function Slate({ progress, slates, tone = 'night' }: { progress: MotionValue<number>; slates: readonly Line[]; tone?: 'night' | 'day' }) {
  return (
    <>
      {slates.map((s, i) => (
        <SlateItem key={i} progress={progress} slate={s} tone={tone} />
      ))}
    </>
  );
}

function SlateItem({ progress, slate, tone }: { progress: MotionValue<number>; slate: Line; tone: 'night' | 'day' }) {
  const id = useId();
  const o = useTransform(progress, (p) => window4(p, slate.from, slate.from + 0.04, slate.to - 0.04, slate.to));
  useMotionValueEvent(o, 'change', (v) => (v > 0.5 ? hud.showSlate(id, slate.text, tone) : hud.hideSlate(id)));
  useEffect(() => () => hud.hideSlate(id), [id]);
  return null;
}

/**
 * The honesty tag for app screens (05-cinema.md §3). Shown on the frame,
 * bottom left, while this shot's stage holds most of the screen: here it is
 * only an invisible marker the size of the stage.
 */
export function Illustrative({ tone = 'night' }: { tone?: 'night' | 'day' }) {
  const id = useId();
  const marker = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = marker.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => hud.illustrative(id, !!e && e.intersectionRatio > 0.6), { threshold: [0, 0.6, 1] });
    io.observe(el);
    return () => {
      io.disconnect();
      hud.illustrative(id, false);
    };
  }, [id]);
  void tone;
  return <span ref={marker} aria-hidden className="pointer-events-none absolute inset-0" />;
}
