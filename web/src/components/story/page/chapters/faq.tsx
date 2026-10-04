import { CONTACT_EMAIL, FAQ, FAQ_COPY as T } from '../../data/strings/page-faq';

/**
 * FAQ (05-cinema.md §3): after the credits, quiet. Native <details>, so every
 * answer is collapsed, opens without JS and stays in the HTML. The same array
 * feeds the FAQPage JSON-LD (components/landing/structured-data.tsx), so keep
 * every question here.
 *
 * The "+" turns 45° in 160 ms when an item opens; with motion off it flips
 * without turning. Height is never animated.
 */
export function Faq() {
  return (
    <section
      id="faq"
      data-tone="night"
      data-chapter="faq"
      aria-labelledby="faq-title"
      className="relative z-10 bg-[#120F0E] [contain-intrinsic-block-size:auto_90svh] [content-visibility:auto]"
    >
      <div className="mx-auto max-w-3xl px-5 py-20 sm:px-8 sm:py-28">
        <h2 id="faq-title" className="text-[clamp(1.75rem,1.4rem+1.6vw,2.5rem)] leading-tight font-semibold tracking-[-0.02em] text-[#F2EDE8]">
          {T.title}
        </h2>

        <div className="mt-8 border-t border-white/[0.08]">
          {FAQ.map(({ q, a }) => (
            <details key={q} className="faq-item group border-b border-white/[0.08]">
              <summary className="flex min-h-12 cursor-pointer list-none items-start justify-between gap-6 rounded-lg py-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F2EDE8] [&::-webkit-details-marker]:hidden">
                <h3 className="text-[17px] leading-[1.4] font-medium text-[#E4DCD5] group-open:text-[#F2EDE8] sm:text-lg">{q}</h3>
                <span aria-hidden className="faq-plus mt-0.5 shrink-0 font-mono text-lg leading-none text-[#D18A5A]">
                  +
                </span>
              </summary>
              <p className="max-w-[62ch] pb-6 text-base leading-[1.65] text-[#BCADA3]">{a}</p>
            </details>
          ))}
        </div>

        <p className="mt-8 text-base text-[#A08E84]">
          {T.other}{' '}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="rounded-sm text-[#D18A5A] underline decoration-[#D18A5A]/40 underline-offset-4 hover:decoration-[#D18A5A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F2EDE8]"
          >
            {CONTACT_EMAIL}
          </a>
        </p>
      </div>
      <style>{`
        .faq-item .faq-plus { transition: transform 160ms cubic-bezier(0.2, 0, 0, 1); }
        .faq-item[open] .faq-plus { transform: rotate(45deg); }
        html:not([data-motion='on']) .faq-item .faq-plus { transition: none; }
      `}</style>
    </section>
  );
}
