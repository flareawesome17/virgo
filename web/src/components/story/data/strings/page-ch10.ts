/**
 * Ch10 — Pricing · #pricing (05-cinema.md §3). Page-authored, so check-story
 * lints it. The plans themselves (names, prices, storage, features) come from
 * `/plans` through the page's props, never from here. Zero-import data module.
 */
export const SOURCES: { text: string; file: string; mode: 'verbatim' }[] = [];

export const CH10_COPY = {
  title: 'Free for now.',
  /** Follows the free plan's storage: "15 GB. No card. No trial clock." */
  sub: 'No card. No trial clock.',
  freePrice: '₱0',
  startFree: 'Start free',
  soon: 'Soon',
  perMonth: '/mo',
  /** Shown only when /plans answered but listed no free plan. */
  fallbackTitle: 'Plans',
  fallbackBody: 'The current plans are listed in the app.',
  seePlans: 'See plans in the app',
} as const;
