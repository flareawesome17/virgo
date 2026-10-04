/**
 * The work (storyboard §2, the interlude) — page-authored copy. The card's
 * own words (title, note, tags, Like · Keep · Hire) are the app's, proven in
 * `work.ts`. Zero-import data module, linted by check-story.
 */
export const SOURCES: { text: string; file: string; mode: 'verbatim' }[] = [];

export const WORK_COPY = {
  eyebrow: 'Showcases · for members',
  title: 'Show the work. Say how you made it.',
  body: 'Post up to ten of your own photos or films as a showcase, with a note on how you made them and up to six craft tags. Other members can like it, keep it on a shelf, or tap Hire. Posting is in the Virgo phone app; members can view on the web too.',
  facts: [
    { k: 'Up to 10', v: 'photos or films a showcase' },
    { k: 'Up to 6', v: 'craft tags' },
    { k: 'Members', v: 'signed in to see it' },
  ],
  caption:
    'A showcase card from the Virgo phone app: Mika’s cover photo, the title “Ten minutes before the rain”, a How it was made note, three craft tags, and Like, See it all and Keep, with a Hire button beside her name. Two more pieces of the same post sit behind it.',
  footnote: 'Showcases are seen by signed-in members only. Interface drawn from the app; the work shown is illustrative.',
} as const;
