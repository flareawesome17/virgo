import { ArrowDown } from 'lucide-react';
import { SIGN_IN_URL, SIGN_UP_URL } from '@/components/landing/links';
import { HERO, LENS, MIKA_CHIP, SKY_CAPTION } from '../../data/strings/page-prologue';
import { MEDIA } from '../../media.generated';
import { StarStop } from '../../svg';
import { PrologueStage } from '../islands/prologue';

/**
 * Prologue — The Sky · #top (storyboard, Prologue).
 *
 * The static page: the hero over the AVIF sky poster, then a circular lens
 * on Cebu with Mika's chip, which implies the zoom. In motion the section
 * becomes a track (180 svh on phones, 200 on desktop): the island publishes
 * the descent to the fixed sky, the copy lifts away, and Mika's chip
 * resolves on her star as the camera lands.
 *
 * The H1 is the LCP element: server-rendered, never in an opacity-0 reveal.
 */

/** The scroll cue's drip: self-running, so it carries `.autoplay` and stops under Pause. */
const CUE_KEYFRAMES = '@keyframes story-cue{0%{transform:translateY(-100%)}100%{transform:translateY(250%)}}';

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[#F2EDE8]';

/** The hero's sky: a CSS-background-like picture behind the copy, mobile and desktop crops. */
function Poster() {
  return (
    <div aria-hidden data-part="hero-poster" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-lvh overflow-hidden">
      <picture>
        <source media="(min-width: 768px)" type={MEDIA.posterDesktopAvif.type} srcSet={MEDIA.posterDesktopAvif.url} />
        <source media="(min-width: 768px)" type={MEDIA.posterDesktopWebp.type} srcSet={MEDIA.posterDesktopWebp.url} />
        <source type={MEDIA.posterMobileAvif.type} srcSet={MEDIA.posterMobileAvif.url} />
        <img
          src={MEDIA.posterMobileWebp.url}
          width={MEDIA.posterMobileWebp.width}
          height={MEDIA.posterMobileWebp.height}
          alt=""
          decoding="async"
          className="size-full object-cover"
        />
      </picture>
      {/* The poster settles into the page's night at its foot. */}
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-b from-transparent to-[#161311]" />
    </div>
  );
}

export function Prologue() {
  return (
    <section id="top" data-tone="night" data-chapter="top" className="relative z-10">
      <style>{CUE_KEYFRAMES}</style>
      <PrologueStage className="relative isolate [html[data-motion='on']_&]:h-[180svh] lg:[html[data-motion='on']_&]:h-[200svh]">
        <Poster />

        {/* Mika's chip, held at the centre of the screen while the camera lands on her (motion only). */}
        <div aria-hidden className="motion-only pointer-events-none absolute inset-0">
          <div className="sticky top-0 h-svh">
            <span
              data-part="mika-chip"
              className="figure absolute left-1/2 top-[calc(50%+22px)] inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-[#D18A5A]/45 bg-[#161311]/92 px-4 py-2 text-[12px] text-[#F2EDE8] shadow-[0_10px_30px_-12px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.05)] sm:text-[13px]"
              style={{ opacity: 0, transform: 'translate3d(-50%, 14px, 0) scale(0.94)' }}
            >
              <span className="size-1.5 rounded-full bg-[#F0C88E] shadow-[0_0_10px_2px_rgba(240,200,142,0.55)]" />
              {MIKA_CHIP}
            </span>
          </div>
        </div>

        <div className="relative mx-auto flex min-h-svh max-w-6xl flex-col justify-center px-5 pb-16 pt-24 sm:px-8 lg:pt-28">
          {/* Copy over the sky sits on a radial scrim (§1.5): dense under the glyphs, fading only outside them. */}
          <div
            aria-hidden
            data-part="hero-scrim"
            className="pointer-events-none absolute inset-x-0 inset-y-[6%] -z-10 bg-[radial-gradient(75%_60%_at_32%_50%,rgba(22,19,17,0.94)_0%,rgba(22,19,17,0.9)_42%,rgba(22,19,17,0.55)_70%,rgba(22,19,17,0)_100%)] lg:bg-[radial-gradient(60%_72%_at_26%_50%,rgba(22,19,17,0.95)_0%,rgba(22,19,17,0.92)_55%,rgba(22,19,17,0.6)_78%,rgba(22,19,17,0)_100%)]"
          />
          <div data-part="hero-copy" className="relative">
            <p className="figure text-xs uppercase tracking-[0.14em] text-[#D18A5A]">{HERO.eyebrow}</p>
            <h1 className="mt-5 max-w-[15ch] text-[clamp(2.75rem,1.6rem+5.6vw,7rem)] font-semibold leading-[0.95] tracking-[-0.035em] [text-wrap:balance]">
              <span className="block font-medium text-[#BCADA3]">{HERO.titleLead}</span>
              <span className="block">
                <span className="bg-gradient-to-r from-[#e8b189] via-[#c17745] to-[#a85f38] bg-clip-text text-transparent">
                  {HERO.titleTail}
                </span>
                <StarStop />
              </span>
            </h1>
            <p className="mt-6 max-w-[34ch] text-[1.0625rem] leading-[1.55] text-[#BCADA3] sm:max-w-[52ch] sm:text-lg">{HERO.lead}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                href={SIGN_UP_URL}
                className={`inline-flex min-h-12 items-center justify-center rounded-xl bg-[#D18A5A] px-6 font-semibold text-[#161311] shadow-[0_12px_32px_-14px_rgba(209,138,90,0.8)] transition-colors hover:bg-[#dc9a6c] ${FOCUS}`}
              >
                {HERO.join}
              </a>
              <a
                href={SIGN_IN_URL}
                className={`inline-flex min-h-12 items-center justify-center rounded-xl border border-white/15 bg-[#161311]/60 px-6 font-semibold text-[#F2EDE8] transition-colors hover:border-white/30 ${FOCUS}`}
              >
                {HERO.signIn}
              </a>
            </div>
            <p className="mt-4 text-sm text-[#A08E84]">{HERO.micro}</p>
            <div className="mt-5 flex flex-wrap items-center gap-x-6">
              <a
                href="#hire"
                className={`group inline-flex min-h-11 items-center gap-2 rounded-md text-[15px] font-medium text-[#F2EDE8] underline decoration-[#D18A5A]/50 underline-offset-[6px] hover:decoration-[#D18A5A] ${FOCUS}`}
              >
                {HERO.follow}
                <ArrowDown aria-hidden size={16} className="text-[#D18A5A] transition-transform group-hover:translate-y-0.5" />
              </a>
              <a
                href="#features"
                className={`inline-flex min-h-11 items-center rounded-md text-[15px] font-medium text-[#BCADA3] underline decoration-white/20 underline-offset-[6px] hover:text-[#F2EDE8] hover:decoration-white/50 ${FOCUS}`}
              >
                {HERO.skip}
              </a>
            </div>
          </div>
          <p className="motion-only sr-only">{SKY_CAPTION}</p>

          {/* A quiet cue that the sky goes somewhere (motion only). */}
          <span
            aria-hidden
            data-part="hero-cue"
            className="motion-only pointer-events-none absolute bottom-6 left-1/2 hidden h-10 w-px -translate-x-1/2 overflow-hidden bg-white/10 lg:block"
          >
            <span className="autoplay absolute inset-x-0 top-0 h-4 animate-[story-cue_2.4s_cubic-bezier(0.65,0,0.35,1)_infinite] bg-gradient-to-b from-transparent via-[#F0C88E] to-transparent" />
          </span>
        </div>

        {/* The static page's zoom: a lens on Cebu City, with Mika's chip already on her star. */}
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
            <span className="block text-lg leading-relaxed text-[#F2EDE8]">{LENS.caption}</span>
            <span className="mt-2 block text-sm leading-relaxed text-[#A08E84]">{SKY_CAPTION}</span>
            <span className="mt-2 block text-xs leading-relaxed text-[#A08E84]">{LENS.footnote}</span>
          </figcaption>
        </figure>
      </PrologueStage>
    </section>
  );
}
