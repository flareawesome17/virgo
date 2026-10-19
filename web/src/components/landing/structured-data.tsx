/**
 * JSON-LD for the landing page.
 *
 * The page describes an organisation, a product and its prices in prose, and
 * a crawler has to infer all of it. Stating it outright is what makes the
 * pricing eligible for a rich result and gives the brand SERP something to
 * assemble a knowledge panel from.
 *
 * A server component with no interactivity, so it costs nothing on the client.
 * Rendered from one `<script>` per graph rather than one combined node,
 * because a malformed entry then fails alone instead of taking the rest with
 * it.
 */

import { CONTACT_EMAIL } from '@/components/story/data/strings/page-finale';

const SITE = 'https://virgo.ph';

export function StructuredData() {
  const organization = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Virgo',
    url: SITE,
    logo: `${SITE}/icon.png`,
    description:
      'A network and workspace for photographers, videographers, editors and HMUAs in the Philippines.',
    areaServed: { '@type': 'Country', name: 'Philippines' },
    email: CONTACT_EMAIL,
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: CONTACT_EMAIL,
    },
  };

  const application = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Virgo',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web, iOS, Android, Windows, macOS',
    url: SITE,
    description:
      'Find and hire creatives near you, run the shoot together, and deliver to clients with links that need no account.',
    // Only what can actually be had today. A structured Offer is a claim to
    // a price engine, and the paid tiers are unreleased and unpriced-in-anger
    // — advertising ₱1,400 here outlived the decision to drop it, and a
    // rich result quoting a price nothing will charge is worse than none.
    offers: {
      '@type': 'Offer',
      name: 'Free',
      price: '0',
      priceCurrency: 'PHP',
      description:
        'Free for now: 15 GB storage, three workspaces, ten albums in each.',
    },
  };

  return (
    <>
      {/* No FAQPage: the page has no visible FAQ, and Google only allows the
          markup for questions a visitor can read on the page. */}
      {[organization, application].map((graph, i) => (
        <script
          key={i}
          type="application/ld+json"
          // The content is ours, not user input, and JSON.stringify escapes
          // the quotes that would otherwise break out of the tag.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
        />
      ))}
    </>
  );
}
