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

const SITE = 'https://virgo.ph';

/** Kept beside the FAQ section's copy — if one changes the other must. */
export const FAQS: { q: string; a: string }[] = [
  {
    q: 'Is Virgo free?',
    a: 'Yes. The free plan includes 15 GB of storage, one workspace and two albums, with no card required. Paid plans add storage, workspaces and albums.',
  },
  {
    q: 'Do my clients need an account to see their photos?',
    a: 'No. You send a client link that opens in any browser. They can view and download without signing up for anything.',
  },
  {
    q: 'What happens to delivered files?',
    a: 'You choose a retention period per album. When it passes, the files are deleted automatically, so old jobs stop consuming your storage.',
  },
  {
    q: 'Who can see my work?',
    a: 'Nobody, unless you share it. Albums are private to you until you grant a collaborator access, and your location is only used for discovery if you turn it on.',
  },
  {
    q: 'How do I find other creatives to work with?',
    a: 'Nearby shows photographers, videographers, editors, HMUAs and coordinators around you who have opted into discovery. You can also post a job to the board and take applications.',
  },
  {
    q: 'Is Virgo only for the Philippines?',
    a: 'It is built for Filipino creatives first — pricing is in pesos and payments go through PayMongo — but nothing stops you using it elsewhere.',
  },
];

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
  };

  const application = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Virgo',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web, iOS, Android',
    url: SITE,
    description:
      'Find and hire creatives near you, run the shoot together, and deliver to clients with links that need no account.',
    offers: [
      {
        '@type': 'Offer',
        name: 'Free',
        price: '0',
        priceCurrency: 'PHP',
        description: '15 GB storage, one workspace, two albums.',
      },
      {
        '@type': 'Offer',
        name: 'Freelance',
        price: '1400',
        priceCurrency: 'PHP',
        description: 'For working professionals. Billed monthly.',
      },
    ],
  };

  const faq = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };

  return (
    <>
      {[organization, application, faq].map((graph, i) => (
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
