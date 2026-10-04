import { CONTACT_EMAIL, FAQ, FAQ_COPY as T } from '../../data/strings/page-faq';

/**
 * FAQ (storyboard §2 FAQ): native <details>/<summary>, so it opens without
 * JS, each question an H3 inside its summary. A solid surface (the sky
 * pauses behind it) with deferred rendering. The same array feeds the
 * FAQPage JSON-LD (components/landing/structured-data.tsx).
 *
 * The "+" turns 45° in 160 ms when an item opens; under reduced motion it
 * flips without turning. Height is never animated.
 */
export function Faq() {
  return (
    <section
      id="faq"
      data-tone="night"
      data-chapter="faq"
      aria-labelledby="faq-title"
      className="relative z-10 bg-[#161311] [contain-intrinsic-block-size:auto_110svh] [content-visibility:auto]"
    >
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-24 sm:px-8 sm:py-32 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <header className="lg:sticky lg:top-28 lg:self-start">
          <p className="font-mono text-xs tracking-[0.14em] text-[#D18A5A] uppercase">{T.eyebrow}</p>
          <h2
            id="faq-title"
            className="mt-3 max-w-[18ch] text-[clamp(2rem,1.3rem+3.4vw,4.25rem)] leading-none font-semibold tracking-[-0.03em] text-balance text-[#F2EDE8]"
          >
            {T.title}
          </h2>
          <p className="mt-5 max-w-[34ch] text-[1.0625rem] leading-[1.55] text-[#BCADA3] sm:text-lg lg:max-w-[40ch]">
            {T.lead}{' '}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="rounded-sm text-[#D18A5A] underline decoration-[#D18A5A]/40 underline-offset-4 hover:decoration-[#D18A5A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F2EDE8]"
            >
              {T.leadLink}
            </a>
            {T.leadEnd}
          </p>
        </header>

        <div className="border-t border-white/[0.08]">
          {FAQ.map(({ q, a }) => (
            <details key={q} className="faq-item group border-b border-white/[0.08]">
              <summary className="flex min-h-12 cursor-pointer list-none items-start justify-between gap-6 rounded-lg py-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F2EDE8] [&::-webkit-details-marker]:hidden">
                <h3 className="text-[clamp(1.125rem,1.05rem+0.5vw,1.375rem)] leading-[1.3] font-medium text-[#F2EDE8]">{q}</h3>
                <span
                  aria-hidden
                  className="faq-plus mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border border-white/10 font-mono text-lg leading-none text-[#D18A5A] group-hover:border-[#D18A5A]/50"
                >
                  +
                </span>
              </summary>
              <p className="max-w-[62ch] pb-6 text-base leading-[1.6] text-[#BCADA3] sm:text-[17px]">{a}</p>
            </details>
          ))}
        </div>
      </div>
      <style>{`
        .faq-item .faq-plus { transition: transform 160ms cubic-bezier(0.2, 0, 0, 1); }
        .faq-item[open] .faq-plus { transform: rotate(45deg); }
        html:not([data-motion='on']) .faq-item .faq-plus { transition: none; }
        @media (prefers-reduced-motion: reduce) { .faq-item .faq-plus { transition: none; } }
      `}</style>
    </section>
  );
}
