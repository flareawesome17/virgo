import { ArrowDown } from 'lucide-react';
import { SIGN_UP_URL } from '@/components/landing/links';
import { DESCENT, HERO, LENS, MIKA_CHIP, SKY_CAPTION } from '../../data/strings/page-prologue';
import { MEDIA } from '../../media.generated';
import { StarStop } from '../../svg';
import { PrologueStage } from '../islands/prologue';
import { FilmPlate } from '../scenes/hero-plate';
import { HeroFilm } from '../scenes/prologue-film';

/**
 * Prologue: the opening title · #top (05-cinema.md §3).
 *
 * A title card over the hero film (scenes/hero-plate.tsx): a cine camera lit
 * in a dark studio, the lights coming up as the page opens. The mark and Sign
 * in sit in the corners (StoryPage's TitleBar); the H1, one line, one call to
 * action and "Scroll to play" sit left of the camera on desktop, below it on
 * phones. In motion the section is a 230 svh track with its frame pinned: the
 * camera pushes into the lens, the title falls back, and the sky descends
 * onto Mika's star under two subtitles.
 *
 * The static page keeps the same title card over the film's still, then a
 * lens on Cebu City.
 * The H1 is the LCP element: server-rendered, never in an opacity-0 reveal.
 */

/** The scroll cue's drip: self-running, so it carries `.autoplay` and stops under Pause. */
const CUE_KEYFRAMES = '@keyframes story-cue{0%{transform:translateY(-100%)}100%{transform:translateY(250%)}}';

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[#F2EDE8]';

/** In motion the frame is pinned for the track; static, it is a plain full-height block. */
const PINNED = "[html[data-motion='on']_&]:sticky [html[data-motion='on']_&]:top-0 [html[data-motion='on']_&]:h-svh [html[data-motion='on']_&]:min-h-0";

export function Prologue() {
  return (
    <section id="top" data-tone="night" data-chapter="top" className="relative z-10">
      <style>{CUE_KEYFRAMES}</style>
      <PrologueStage className="relative isolate [html[data-motion='on']_&]:h-[230svh]">
        <div className={`relative min-h-svh overflow-clip ${PINNED}`}>
          <FilmPlate />
          <HeroFilm />

          <div className="relative z-10 flex min-h-svh flex-col items-center justify-end px-5 pb-[max(2.5rem,6svh)] pt-28 text-center [html[data-motion='on']_&]:h-full [html[data-motion='on']_&]:min-h-0 sm:px-8 lg:items-start lg:justify-center lg:pb-0 lg:pl-[7vw] lg:text-left">
            {/* Copy over the sky sits on a radial scrim (§1.5): dense under the glyphs, fading only outside them. */}
            <div
              aria-hidden
              data-part="hero-scrim"
              className="pointer-events-none absolute inset-x-0 bottom-0 top-[44%] -z-10 bg-[linear-gradient(180deg,rgba(22,19,17,0)_0%,rgba(22,19,17,0.85)_30%,rgba(22,19,17,0.96)_100%)] lg:hidden"
            />
            <div data-part="hero-copy" className="relative flex flex-col items-center lg:max-w-[min(38vw,580px)] lg:items-start">
              <p className="font-mono text-[11px] uppercase tracking-[0.32em] text-[#D18A5A] sm:text-xs">{HERO.eyebrow}</p>
              <h1 className="mt-5 max-w-[16ch] text-[clamp(2.6rem,1.2rem+4.4vw,5.5rem)] font-semibold lg:max-w-[13ch] lg:text-[clamp(3rem,0.9rem+3.7vw,5rem)] leading-[0.98] tracking-[-0.035em] [text-wrap:balance]">
                <span className="block font-medium text-[#BCADA3]">{HERO.titleLead}</span>{' '}
                <span className="block">
                  <span className="bg-gradient-to-r from-[#e8b189] via-[#c17745] to-[#a85f38] bg-clip-text text-transparent">{HERO.titleTail}</span>
                  <StarStop />
                </span>
              </h1>
              <p className="mt-6 max-w-[36ch] text-pretty text-[1.0625rem] leading-[1.55] text-[#BCADA3] sm:max-w-[46ch] sm:text-lg">{HERO.lead}</p>
              <a
                href={SIGN_UP_URL}
                className={`mt-8 inline-flex min-h-12 items-center justify-center rounded-full bg-[#D18A5A] px-7 font-semibold text-[#161311] shadow-[0_12px_32px_-14px_rgba(209,138,90,0.8)] transition-colors hover:bg-[#dc9a6c] ${FOCUS}`}
              >
                {HERO.join}
              </a>
              <a
                href="#hire"
                className={`group mt-6 inline-flex min-h-11 flex-col items-center gap-2 rounded-md font-mono text-[11px] uppercase tracking-[0.24em] text-[#A08E84] transition-colors hover:text-[#F2EDE8] ${FOCUS}`}
              >
                {HERO.cue}
                <span aria-hidden className="relative block h-8 w-px overflow-hidden bg-white/10">
                  <span className="autoplay absolute inset-x-0 top-0 h-3 animate-[story-cue_2.4s_cubic-bezier(0.65,0,0.35,1)_infinite] bg-gradient-to-b from-transparent via-[#F0C88E] to-transparent motion-reduce:hidden" />
                </span>
                <ArrowDown aria-hidden size={14} className="hidden text-[#D18A5A] motion-reduce:block" />
              </a>
            </div>
            <p className="motion-only sr-only">{SKY_CAPTION}</p>
          </div>
        </div>

        {/* The static page's descent: a lens on Cebu City, with Mika's chip already on her star. */}
        <figure className="static-only relative mx-auto max-w-6xl px-5 pb-24 pt-4 sm:px-8">
          <div className="mx-auto w-[min(86vw,420px)] [perspective:1200px]">
            <div className="relative [transform:rotateX(10deg)] [transform-origin:50%_100%]">
              <div className="absolute inset-x-[8%] -bottom-[6%] h-[12%] rounded-[50%] bg-[radial-gradient(closest-side,rgba(0,0,0,0.6),rgba(0,0,0,0))]" />
              <picture>
                <source type={MEDIA.cebuLensAvif.type} srcSet={MEDIA.cebuLensAvif.url} />
                <img
                  src={MEDIA.cebuLensWebp.url}
                  width={MEDIA.cebuLensWebp.width}
                  height={MEDIA.cebuLensWebp.height}
                  alt={`${LENS.alt} Its label reads “${MIKA_CHIP}”.`}
                  loading="lazy"
                  decoding="async"
                  className="relative h-auto w-full rounded-full shadow-[0_0_0_1px_rgba(209,138,90,0.25),0_30px_80px_-30px_rgba(0,0,0,0.9)]"
                />
              </picture>
            </div>
          </div>
          <figcaption className="mx-auto mt-10 max-w-[44ch] text-center">
            <span className="block text-2xl font-semibold tracking-[-0.02em] text-[#F2EDE8]">{DESCENT[0]}</span>
            <span className="mt-2 block text-lg leading-relaxed text-[#BCADA3]">{DESCENT[1]}</span>
            <span className="mt-4 block text-xs leading-relaxed text-[#A08E84]">{LENS.footnote}</span>
          </figcaption>
        </figure>
      </PrologueStage>
    </section>
  );
}
