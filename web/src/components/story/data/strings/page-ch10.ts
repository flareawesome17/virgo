/**
 * Ch10 — Pricing (storyboard §2 Ch10). Page-authored, so check-story lints it.
 * The plans themselves (names, prices, limits, features) come from `/plans`
 * through the page's props, never from here. Zero-import data module.
 */
export const SOURCES: { text: string; file: string; mode: 'verbatim' }[] = [];

export const CH10_COPY = {
  eyebrow: '10 · Pricing',
  title: 'Free for now.',
  lead: 'No card, no trial clock. We would rather find out what a working photographer actually needs than guess at a price and be wrong about it.',
  freeBadge: 'Available now',
  freePrice: '₱0',
  freePriceNote: 'for now',
  startFree: 'Start free',
  upcomingTitle: 'Upcoming',
  upcoming: 'Where pricing is heading once paid plans arrive. Nothing here is charged yet. If a number looks wrong,',
  tellUs: 'tell us',
  tellUsEnd: '.',
  soon: 'Soon',
  perMonth: '/mo',
  /** Shown only when /plans answered but listed no free plan. */
  fallbackTitle: 'Plans',
  fallbackBody: 'The current plans are listed in the app.',
  seePlans: 'See plans in the app',
  /** The figure's caption: the stars and horizon are decoration. */
  caption: 'The free plan’s star has risen above the horizon; the three upcoming plans’ stars are still below it.',
} as const;
