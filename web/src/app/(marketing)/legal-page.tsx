import type { Metadata } from 'next';
import Link from 'next/link';
import { CONTACT_EMAIL, LAST_UPDATED, type Clause } from '@/lib/legal-content';

/**
 * Terms and Privacy, on the public site.
 *
 * They lived only behind the app, where the root layout tells crawlers to stay
 * out — so the two documents a payment processor, an app store and a cautious
 * customer all look for were, to the outside world, missing. The copy is the
 * same module the in-app page renders; only the shell differs.
 *
 * A server component: static prose has no reason to ship JavaScript, and these
 * are the pages most likely to be opened on a bad connection.
 */
export function legalMetadata(
  kind: 'Terms' | 'Privacy Policy',
  path: string,
  description: string,
): Metadata {
  return {
    title: { absolute: `${kind} · Virgo` },
    description,
    robots: { index: true, follow: true },
    alternates: { canonical: `https://virgo.ph${path}` },
  };
}

export function LegalPage({
  heading,
  intro,
  clauses,
}: {
  heading: string;
  intro: string;
  clauses: Clause[];
}) {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <Link
        href="/"
        className="text-sm text-muted-foreground underline hover:text-foreground"
      >
        ← Virgo
      </Link>

      <h1 className="mt-6 text-3xl font-bold tracking-tight sm:text-4xl">
        {heading}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Last updated {LAST_UPDATED}
      </p>
      <p className="mt-6 leading-relaxed text-muted-foreground">{intro}</p>

      <div className="mt-10 space-y-8">
        {clauses.map((clause) => (
          <section key={clause.heading}>
            <h2 className="text-lg font-semibold">{clause.heading}</h2>
            <ul className="mt-3 space-y-2">
              {clause.body.map((line) => (
                <li
                  key={line}
                  className="text-sm leading-relaxed text-muted-foreground"
                >
                  {line}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <p className="mt-12 border-t pt-6 text-sm text-muted-foreground">
        Questions about this document?{' '}
        <a href={`mailto:${CONTACT_EMAIL}`} className="underline hover:text-foreground">
          {CONTACT_EMAIL}
        </a>
      </p>
    </main>
  );
}
