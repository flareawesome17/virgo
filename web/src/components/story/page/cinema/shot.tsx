'use client';

import { m, useTransform, type MotionValue } from 'framer-motion';
import { useRef, type ReactNode } from 'react';
import { useChapterProgress } from '../motion';
import { r2, window4 } from './ease';

/**
 * A pinned shot (docs/redesign/05-cinema.md §1): `length` svh of scroll during
 * which a full-viewport stage holds still and the children animate from the
 * shot's progress (0 → 1). The camera should always be moving inside it.
 */
export function Shot({
  length = 120,
  className = '',
  children,
}: {
  /** Scroll distance in svh, beyond the 100svh the stage itself takes. */
  length?: number;
  className?: string;
  children: (progress: MotionValue<number>) => ReactNode;
}) {
  const track = useRef<HTMLDivElement>(null);
  const progress = useChapterProgress(track, 'track');
  return (
    <div ref={track} className="relative" style={{ height: `${100 + length}svh` }}>
      <div className={`sticky top-0 h-svh overflow-clip ${className}`}>{children(progress)}</div>
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
    <m.div style={{ opacity: o, transform: t }} className="col-start-1 row-start-1 px-6 py-5">
      <div aria-hidden className={`absolute -inset-x-8 -inset-y-6 -z-10 ${scrim}`} />
      <p className={`text-balance text-[clamp(1.6rem,1rem+3.2vw,2.4rem)] lg:text-[clamp(2rem,0.9rem+1.9vw,2.9rem)] font-semibold leading-[1.08] tracking-[-0.025em] ${ink}`}>{line.text}</p>
      {line.small && <p className={`mt-3 text-pretty text-[15px] sm:text-[17px] ${tone === 'day' ? 'text-[#54433C]' : 'text-[#BCADA3]'}`}>{line.small}</p>}
    </m.div>
  );
}

/** The scene slate: a mono time card, top-left, like a film's location title. */
export function Slate({ progress, slates, tone = 'night' }: { progress: MotionValue<number>; slates: readonly Line[]; tone?: 'night' | 'day' }) {
  return (
    <div className="pointer-events-none absolute left-5 top-6 z-30 grid sm:left-8 sm:top-8">
      {slates.map((s, i) => (
        <SlateItem key={i} progress={progress} slate={s} tone={tone} />
      ))}
    </div>
  );
}

function SlateItem({ progress, slate, tone }: { progress: MotionValue<number>; slate: Line; tone: 'night' | 'day' }) {
  const o = useTransform(progress, (p) => window4(p, slate.from, slate.from + 0.04, slate.to - 0.04, slate.to));
  return (
    <m.p
      style={{ opacity: o }}
      className={`col-start-1 row-start-1 font-mono text-[11px] uppercase tracking-[0.2em] sm:text-xs ${tone === 'day' ? 'text-[#7A3E1E]' : 'text-[#D18A5A]'}`}
    >
      {slate.text}
    </m.p>
  );
}

/** The one-word honesty tag every app shot carries (05-cinema.md §3). */
export function Illustrative({ tone = 'night' }: { tone?: 'night' | 'day' }) {
  return (
    <p className={`pointer-events-none absolute right-5 top-6 z-30 font-mono text-[10.5px] uppercase tracking-[0.2em] sm:right-8 sm:top-8 ${tone === 'day' ? 'text-[#6F5C52]' : 'text-[#A08E84]'}`}>
      Illustrative
    </p>
  );
}
