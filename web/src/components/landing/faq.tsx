import { FAQS } from '@/components/landing/structured-data';
import { Reveal } from './reveal';
import { SectionHeader } from './section-header';

/**
 * The objections, answered.
 *
 * Two jobs at once: it handles the questions that otherwise stop somebody
 * signing up — do my clients need an account, who can see my work — and it is
 * the visible half of the FAQPage schema, which is what makes these eligible
 * to appear directly in a search result.
 *
 * The copy lives in `structured-data.tsx` and is read from there, so the
 * answer a crawler is told and the answer a person reads cannot drift apart.
 *
 * `<details>` rather than a state-driven accordion: it needs no JavaScript,
 * it is keyboard accessible for free, and Ctrl+F finds text inside a closed
 * one in most browsers.
 *
 * The narrow measure is deliberate and stays — a question and its answer read
 * better at ~65 characters than across the full grid. What did not stay is the
 * rest of it: this section was styled in shadcn's `--border` and
 * `text-muted-foreground` tokens on a page that hardcodes its own dark
 * palette, so it rendered in a different grey from everything above it, at a
 * lighter heading weight, with no entrance animation. It read as a section
 * built on a different day, because it was.
 */
export function LandingFaq() {
  return (
    <section id="faq" className="mx-auto w-full max-w-3xl px-6 py-24 sm:py-28">
      <SectionHeader
        index="09"
        eyebrow="FAQ"
        align="center"
        size="sm"
        title="Questions people ask"
        lead={
          <>
            The short answers. If yours is not here,{' '}
            <a
              href="mailto:hello@virgo.ph"
              className="text-white/75 underline underline-offset-4 transition-colors hover:text-white"
            >
              email us
            </a>
            .
          </>
        }
      />

      <div className="mt-10 divide-y divide-white/8 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
        {FAQS.map(({ q, a }, i) => (
          <Reveal key={q} delay={Math.min(i, 4) * 60}>
            <details className="group px-5 py-4 [&_summary]:list-none">
              {/* min-h-11 (44px): the row was 24px tall, which on a phone is a
                  target you have to aim at. The padding lives on the <details>,
                  so height had to come from the summary itself. */}
              <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-4 text-left text-[15px] font-semibold text-white/90 transition-colors hover:text-white">
                {q}
                <span
                  aria-hidden
                  className="figure shrink-0 text-lg leading-none text-[#c17745] transition-transform duration-300 group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="mt-3 text-[14px] leading-relaxed text-white/55">
                {a}
              </p>
            </details>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
