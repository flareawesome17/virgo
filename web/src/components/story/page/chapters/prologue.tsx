import { SIGN_IN_URL, SIGN_UP_URL } from '@/components/landing/links';

/**
 * Prologue — STUB written by the page foundation, with the real hero copy so
 * the page has its H1 and CTAs from the start. The builder replaces it
 * (storyboard Prologue). Keep the export name, id="top" and the H1 visible at
 * first paint: it is the LCP element and must never start at opacity 0.
 */
export function Prologue() {
  return (
    <section id="top" data-tone="night" data-chapter="top" className="relative z-10 mx-auto flex min-h-svh max-w-6xl flex-col justify-center px-5 pt-24 pb-16 sm:px-8">
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-[#D18A5A]">Built in the Philippines, for Filipino creatives</p>
      <h1 className="mt-5 max-w-[14ch] text-[clamp(2.75rem,1.6rem+5.6vw,7rem)] leading-[0.95] font-semibold tracking-[-0.035em]">
        <span className="block font-medium text-[#BCADA3]">Where creatives find</span>
        <span className="block bg-gradient-to-r from-[#e8b189] via-[#c17745] to-[#a85f38] bg-clip-text text-transparent">
          each other, and get paid.
        </span>
      </h1>
      <p className="mt-6 max-w-[34ch] text-lg leading-relaxed text-[#BCADA3] sm:max-w-[52ch]">
        Virgo is a network of photographers, videographers, editors and HMUAs, and the workspace they run the job from.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <a href={SIGN_UP_URL} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#D18A5A] px-6 font-semibold text-[#161311]">
          Join the community
        </a>
        <a href={SIGN_IN_URL} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/15 px-6 font-semibold text-[#F2EDE8]">
          Sign in
        </a>
      </div>
      <p className="mt-4 text-sm text-[#A08E84]">Free plan with 15 GB. No card needed.</p>
    </section>
  );
}
