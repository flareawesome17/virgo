/**
 * The FAQ (05-cinema.md §3: after the credits, quiet, collapsed). Page-
 * authored, so check-story lints it. Every question stays.
 *
 * One array feeds both the visible list (`page/chapters/faq.tsx`) and the
 * FAQPage JSON-LD (`components/landing/structured-data.tsx`), so the answer a
 * crawler reads is always the answer a visitor reads.
 *
 * Zero-import data module: no aliases, React or packages.
 */
export const SOURCES: { text: string; file: string; mode: 'verbatim' }[] = [];

/** The one contact address the page uses (owner decision, 2026-10-04). */
export const CONTACT_EMAIL = 'support@virgo.ph';

export const FAQ_COPY = {
  title: 'Questions',
  /** Followed by the contact address, as a mail link. */
  other: 'Something else?',
} as const;

export const FAQ: readonly { q: string; a: string }[] = [
  {
    q: 'Is Virgo free?',
    a: 'Yes. Virgo is free for everyone for now: 15 GB of storage and three workspaces of up to ten albums each, with no card required. Paid tiers arrive later; nothing is charged today.',
  },
  {
    q: 'Do my clients need an account to see their photos?',
    a: 'No. You send a client link that opens in any browser. They can view and download without signing up for anything.',
  },
  {
    q: 'What happens to delivered files?',
    a: 'You choose when you make an album. Set how long to keep its files and each one is deleted that long after it was uploaded, along with its preview copies, and you get a notice saying how many went. The album and its link stay, so tell your client the date. Leave it unset and files stay until you delete them.',
  },
  {
    q: 'Who can see my work?',
    a: 'Nobody, unless you share it. Albums are private to you until you give a collaborator access or send a client link. Showcases you post are seen only by signed-in members. Your location is only used for discovery if you turn it on.',
  },
  {
    q: 'How do I find other creatives to work with?',
    a: 'Nearby shows photographers, videographers, editors, HMUAs and coordinators around you who have opted into discovery. You can also post a job to the board, with a budget for each role, and take applications.',
  },
  {
    q: 'Can I use a city instead of GPS?',
    a: 'Yes. Name your city and you’re findable in Nearby from its centre. Other people only ever see how far away you are, in whole kilometres, and turning sharing off erases it.',
  },
  {
    q: 'Is it safe?',
    a: 'In the Virgo phone app you can block or report someone from their profile, a chat, Nearby, a request, an enquiry, an application or a job post. Blocking declines anything pending between you, hides you from each other in search, Nearby and the job board, and freezes your direct chat with its history kept. Reports go to the Virgo team. Client links use a long random address and tell search engines not to index them.',
  },
  {
    q: 'Is Virgo only for the Philippines?',
    a: 'It is built for Filipino creatives first, and pricing will be in pesos when paid plans arrive, but nothing stops you using it elsewhere.',
  },
  {
    q: 'Does Virgo take payment for jobs?',
    a: 'No. When you hire through the job board, Virgo writes down the role, date, place, rate and what’s included, and the person you hired confirms it. The money goes between the two of you, the way it does now.',
  },
];
