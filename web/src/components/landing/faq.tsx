import { FAQS } from '@/components/landing/structured-data';

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
 */
export function LandingFaq() {
  return (
    <section id="faq" className="mx-auto w-full max-w-3xl px-6 py-20">
      <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
        Questions people ask
      </h2>
      <p className="mt-3 text-center text-muted-foreground">
        The short answers. If yours is not here,{' '}
        <a href="mailto:hello@virgo.ph" className="underline hover:text-foreground">
          email us
        </a>
        .
      </p>

      <div className="mt-10 divide-y rounded-2xl border">
        {FAQS.map(({ q, a }) => (
          <details key={q} className="group px-5 py-4 [&_summary]:list-none">
            {/* min-h-11 (44px): the row was 24px tall, which on a phone is a
                target you have to aim at. The padding lives on the <details>,
                so height had to come from the summary itself. */}
            <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-4 text-left font-medium">
              {q}
              <span
                aria-hidden
                className="shrink-0 text-muted-foreground transition-transform group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {a}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}
