'use client';

import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import { Reveal } from './reveal';
import { SIGN_IN_URL, SIGN_UP_URL } from './links';

export function LandingClosing() {
  return (
    <section className="relative overflow-hidden py-24 sm:py-32">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(42rem_26rem_at_50%_100%,color-mix(in_oklab,var(--primary)_22%,transparent),transparent_70%)]"
      />

      <Reveal className="relative mx-auto w-full max-w-3xl px-5 text-center sm:px-8">
        <Image
          src="/logo.png"
          alt=""
          width={56}
          height={56}
          className="mx-auto size-14 object-contain"
        />
        <h2 className="mt-7 text-balance text-3xl font-extrabold tracking-tight text-white sm:text-[2.75rem] sm:leading-[1.1]">
          The next booking could run through it
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-pretty text-[15px] leading-relaxed text-white/55">
          Free to start, 15&nbsp;GB included, and nothing for your clients to
          install. Add your roles, see who is working near you, and take it from
          there.
        </p>

        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href={SIGN_UP_URL}
            className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#c17745] px-7 py-3.5 text-[15px] font-bold text-white shadow-xl shadow-[#c17745]/30 transition-all hover:bg-[#cd8250] active:scale-[0.98] sm:w-auto"
          >
            Join the community
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </a>
          <a
            href={SIGN_IN_URL}
            className="inline-flex w-full items-center justify-center rounded-xl border border-white/15 px-7 py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-white/5 active:scale-[0.98] sm:w-auto"
          >
            Sign in
          </a>
        </div>
      </Reveal>
    </section>
  );
}

export function LandingFooter() {
  return (
    <footer className="border-t border-white/8 py-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-5 px-5 sm:flex-row sm:px-8">
        <div className="flex items-center gap-2.5">
          <Image src="/logo.png" alt="" width={22} height={22} className="size-[22px] object-contain" />
          <span className="text-[13px] font-bold text-white/70">Virgo</span>
          <span className="text-[12px] text-white/25">
            © {new Date().getFullYear()}
          </span>
        </div>

        {/* py-2 gives these real height. At 18px they were legible but only
            just tappable, and they are the links somebody reaches for when
            they want the terms before signing up. */}
        <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1">
          {/* The public pages, not the in-app ones.
              /terms and /privacy exist on this site, are indexable, and are
              in the sitemap — but every link here pointed at web.virgo.ph
              instead, which is behind a noindex. So the two documents a
              payment processor, an app store and a cautious customer all go
              looking for were submitted to Google with nothing linking to
              them, and a reader who clicked Terms was dropped into the app
              shell. Relative, so they stay on whichever host served this. */}
          <a
            href="/terms"
            className="inline-flex min-h-11 items-center text-[12px] text-white/40 transition-colors hover:text-white/70"
          >
            Terms
          </a>
          <a
            href="/privacy"
            className="inline-flex min-h-11 items-center text-[12px] text-white/40 transition-colors hover:text-white/70"
          >
            Privacy
          </a>
          <a
            href="mailto:support@virgo.ph"
            className="inline-flex min-h-11 items-center text-[12px] text-white/40 transition-colors hover:text-white/70"
          >
            support@virgo.ph
          </a>
        </nav>
      </div>
    </footer>
  );
}
