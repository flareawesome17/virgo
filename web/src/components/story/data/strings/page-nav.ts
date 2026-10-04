/**
 * The story page's navigation copy: header links and the Chapters menu
 * (storyboard §1.9, Appendix B). Page-authored, so check-story lints it.
 */
export const SOURCES: { text: string; file: string; mode: 'verbatim' }[] = [];

export const NAV_LINKS = [
  { label: 'Hire', href: '#hire' },
  { label: 'Community', href: '#community' },
  { label: 'Deliver', href: '#delivery' },
  { label: 'Features', href: '#features' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'Download', href: '/download' },
] as const;

export const CHAPTER_LINKS = [
  { n: '—', label: 'The sky', href: '#top' },
  { n: '01', label: 'Wednesday night', href: '#hire' },
  { n: '02', label: 'Nearby', href: '#nearby' },
  { n: '03', label: 'Connect', href: '#connect' },
  { n: '04', label: 'The calendar', href: '#calendar' },
  { n: '05', label: 'Saturday', href: '#saturday' },
  { n: '06', label: 'The handover', href: '#delivery' },
  { n: '07', label: 'Forget', href: '#forget' },
  { n: '—', label: 'The work', href: '#the-work' },
  { n: '08', label: 'Every Saturday', href: '#community' },
  { n: '09', label: 'Everything around the shoot', href: '#features' },
  { n: '10', label: 'Pricing', href: '#pricing' },
  { n: '—', label: "This one's you", href: '#start' },
  { n: '?', label: 'Questions', href: '#faq' },
] as const;
