'use client';

import { m, useScroll, useTransform } from 'framer-motion';
import { Download, Pause, Play } from 'lucide-react';
import { useEffect, useState } from 'react';
import { DOWNLOAD_PATH, SIGN_IN_URL, SIGN_UP_URL } from '@/components/landing/links';
import { CHAPTERS, FRAME_COPY as T } from '../../data/strings/page-frame';
import { steady, useMotionGate } from '../motion';
import { PAUSE_KEY } from '../pre-paint';
import { r2 } from './ease';
import { useHud } from './hud';

/**
 * The frame the film plays in (05-cinema.md §2): a thin matte round the
 * screen with a hairline and gold corner marks, like a camera's viewfinder.
 * Everything the visitor can press lives on it, in the same four places for
 * the whole page:
 * - top left, the Virgo mark as a watermark (a broadcast "bug"), home;
 * - top right, Sign in and Join;
 * - bottom left, the scene's time card and, over app screens, "Illustrative";
 * - bottom right, Pause and Download.
 * On desktop the side rails carry the tagline (left) and the chapter in view
 * (right); the progress line runs along the frame's foot. A fine dot matrix
 * lies over the whole film, drifting slower than the scroll: the page's one
 * texture (the scenes carry no decorative shapes).
 *
 * Off the film (`film={false}`, the download page) the frame keeps its matte,
 * texture, watermark and account buttons; the right rail names the page, and
 * the time card, Pause, Download and the progress line stay with the film.
 */

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[#F2EDE8]';
const MONO = 'font-mono text-[10.5px] uppercase tracking-[0.24em] sm:text-[11px]';

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

/** The chapter whose section crosses the middle of the screen. */
function useChapter(enabled: boolean): string {
  const [id, setId] = useState('top');
  useEffect(() => {
    if (!enabled) return;
    const sections = [...document.querySelectorAll<HTMLElement>('.story-page main > section[data-chapter]')];
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setId(e.target.getAttribute('data-chapter') ?? 'top');
      },
      { rootMargin: '-50% 0px -50% 0px' },
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [enabled]);
  return id;
}

export function Frame({
  film = true,
  home = '#top',
  homeLabel = T.home,
  rail,
}: {
  /** False off the story: no time card, Pause, Download or progress line. */
  film?: boolean;
  /** Where the watermark goes: the top of the story, or the story from elsewhere. */
  home?: string;
  homeLabel?: string;
  /** The right rail's text off the film (on it, the chapter in view). */
  rail?: string;
} = {}) {
  const gate = useMotionGate();
  const hud = useHud();
  const chapter = useChapter(film);
  // Over a daylight scene the time card is set in ink, not gold.
  const day = !!hud.slate && hud.tone === 'day';
  const { scrollY, scrollYProgress } = useScroll();
  const progress = useTransform(scrollYProgress, (p) => `scaleX(${r2(p * 1000) / 1000})`);
  // The texture drifts at a twentieth of the scroll: far behind the scene, so it reads as depth.
  const drift = useTransform(scrollY, (y) => `translate3d(0,${r2(-((y * 0.05) % 16))}px,0)`);

  return (
    <>
      {/* The texture: one fine dot matrix over the whole film. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-[41] overflow-hidden">
        <m.div
          // Still on phones: a fine pattern moving over the film shimmers there.
          style={gate.motion && !steady() ? { transform: drift } : undefined}
          className="absolute -inset-y-4 inset-x-0 bg-[radial-gradient(circle,rgba(240,200,142,0.9)_0.7px,transparent_1.3px)] bg-[length:16px_16px] opacity-[0.05] [mask-image:radial-gradient(130%_100%_at_50%_45%,rgba(0,0,0,0.55)_30%,black_100%)]"
        />
      </div>

      {/* The matte and the hairline. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-[46]">
        <div className="absolute inset-x-0 top-0 h-[var(--frame)] bg-[#0B0908]" />
        <div className="absolute inset-x-0 bottom-0 h-[var(--frame)] bg-[#0B0908]" />
        <div className="absolute inset-y-0 left-0 w-[var(--frame)] bg-[#0B0908]" />
        <div className="absolute inset-y-0 right-0 w-[var(--frame)] bg-[#0B0908]" />
        <div className="absolute inset-[var(--frame)] rounded-[6px] border border-[rgba(242,237,232,0.14)] shadow-[0_0_0_6px_#0B0908]" />
        {(['left-[calc(var(--frame)-6px)] top-[calc(var(--frame)-6px)] border-l-2 border-t-2', 'right-[calc(var(--frame)-6px)] top-[calc(var(--frame)-6px)] border-r-2 border-t-2', 'bottom-[calc(var(--frame)-6px)] left-[calc(var(--frame)-6px)] border-b-2 border-l-2', 'bottom-[calc(var(--frame)-6px)] right-[calc(var(--frame)-6px)] border-b-2 border-r-2'] as const).map((c) => (
          <span key={c} className={`absolute size-3.5 border-[#D18A5A] lg:size-4 ${c}`} />
        ))}
        {/* The progress line, along the frame’s foot. */}
        {film && (
          <div className="absolute bottom-[var(--frame)] left-[calc(var(--frame)+6px)] right-[calc(var(--frame)+6px)] h-px">
            <m.div style={{ transform: progress }} className="h-full origin-left bg-gradient-to-r from-[#A85F38] via-[#D18A5A] to-[#F0C88E]" />
          </div>
        )}
        {/* The rails (desktop). */}
        <p className={`absolute left-[calc(var(--frame)/2)] top-1/2 hidden origin-center -translate-x-1/2 -translate-y-1/2 -rotate-90 whitespace-nowrap text-[#A08E84]/80 lg:block ${MONO}`}>{T.tagline}</p>
        <p key={chapter} className={`story-hud-fade absolute right-[calc(var(--frame)/2)] top-1/2 hidden origin-center translate-x-1/2 -translate-y-1/2 rotate-90 whitespace-nowrap text-[#BCADA3] lg:block ${MONO}`}>
          {film ? (CHAPTERS[chapter] ?? '') : rail}
        </p>
      </div>

      {/* Top left: the watermark. */}
      <a
        href={home}
        aria-label={homeLabel}
        className={`group fixed left-[calc(var(--frame)+12px)] top-[calc(var(--frame)+10px)] z-50 inline-flex min-h-10 items-center gap-2 rounded-md opacity-55 transition-opacity hover:opacity-100 lg:left-[calc(var(--frame)+18px)] lg:top-[calc(var(--frame)+14px)] ${FOCUS}`}
      >
        <span aria-hidden className="block size-6 bg-contain bg-center bg-no-repeat lg:size-7" style={{ backgroundImage: 'url(/logo.png)' }} />
        <span aria-hidden className="hidden font-mono text-[11px] uppercase tracking-[0.42em] text-[#F2EDE8] sm:inline">
          Virgo
        </span>
      </a>

      {/* Top right: Sign in and Join. Sign in sits on a dark chip, so it reads over the daylight scenes too. */}
      <div className="fixed right-[calc(var(--frame)+10px)] top-[calc(var(--frame)+10px)] z-50 flex items-center gap-1.5 lg:right-[calc(var(--frame)+16px)] lg:top-[calc(var(--frame)+14px)] lg:gap-2">
        <a
          href={SIGN_IN_URL}
          className={`inline-flex min-h-9 items-center rounded-full border border-white/10 bg-[#161311]/60 px-3.5 text-[13px] font-medium text-[#D8CCC4] transition-colors hover:text-[#F2EDE8] ${FOCUS}`}
        >
          {T.signIn}
        </a>
        <a
          href={SIGN_UP_URL}
          className={`inline-flex min-h-9 items-center rounded-full bg-[#D18A5A] px-4 text-[13px] font-semibold text-[#161311] transition-colors hover:bg-[#E09A69] ${FOCUS}`}
        >
          {T.join}
        </a>
      </div>

      {film && (
        <>
          {/* Bottom left: the time card and the honesty tag. */}
          <div aria-live="off" className={`pointer-events-none fixed bottom-[calc(var(--frame)+12px)] left-[calc(var(--frame)+12px)] z-50 flex max-w-[52vw] flex-wrap items-center gap-x-4 gap-y-1 lg:bottom-[calc(var(--frame)+16px)] lg:left-[calc(var(--frame)+18px)] ${MONO}`}>
            {hud.slate && (
              <span key={hud.slate} className={`story-hud-fade ${day ? 'text-[#8A4A26]' : 'text-[#D18A5A]'}`}>
                {hud.slate}
              </span>
            )}
            {hud.illustrative && <span className={`story-hud-fade ${day ? 'text-[#5E5048]' : 'text-[#A08E84]'}`}>{T.illustrative}</span>}
          </div>

          {/* Bottom right: Pause and Download. */}
          <div className="fixed bottom-[calc(var(--frame)+8px)] right-[calc(var(--frame)+10px)] z-50 flex items-center gap-2 lg:bottom-[calc(var(--frame)+12px)] lg:right-[calc(var(--frame)+16px)]">
            {gate.motion && (
              <button
                type="button"
                onClick={togglePause}
                aria-pressed={gate.paused}
                aria-label={T.pause}
                className={`grid size-9 place-items-center rounded-full border border-white/15 bg-[#161311]/70 text-[#BCADA3] transition-colors hover:text-[#F2EDE8] ${FOCUS}`}
              >
                {gate.paused ? <Play aria-hidden className="size-3.5" /> : <Pause aria-hidden className="size-3.5" />}
              </button>
            )}
            <a
              href={DOWNLOAD_PATH}
              className={`inline-flex min-h-9 items-center gap-2 rounded-full bg-[#F2EDE8] px-4 text-[13px] font-semibold text-[#161311] transition-colors hover:bg-white ${FOCUS}`}
            >
              <Download aria-hidden className="size-3.5" />
              <span className="sm:hidden">{T.downloadShort}</span>
              <span className="hidden sm:inline">{T.download}</span>
            </a>
          </div>
        </>
      )}
    </>
  );
}
