/**
 * The work (the optional interlude): one showcase post, as the phone app's
 * feed draws it. A non-wedding piece of Mika's, never tied to the Reyes &
 * Santos album, because the clean-up would delete it.
 *
 * A zero-import data module (see `../story.ts`). The post's title and note
 * are the app's own placeholders in the compose form, and the tags are three
 * of its suggestions, so every word on the card is proven against the app.
 */
import { CAST, HOME, SHOWCASE } from '../story';
import type { SourceEntry } from './common';

const FEED = 'mobile/app/(app)/(tabs)/feed.tsx';
const COMPOSE = 'mobile/app/(app)/showcase/new.tsx';
const WEB_FEED = 'web/src/app/(app)/feed/page-client.tsx';

/** The post, as the card prints it. */
export const SHOWCASE_POST = {
  maker: CAST.mika.name,
  /** The maker's own profile title, and where the post says it was made. Illustrative. */
  makerTitle: 'Photographer',
  location: HOME.city,
  title: SHOWCASE.title,
  note: SHOWCASE.howItWasMade,
  tags: SHOWCASE.tags,
} as const;

/** The placard's words (`feed.tsx` Placard). The web feed writes "How it was made" and uppercases it in CSS. */
export const SHOWCASE_CARD = {
  craft: 'HOW IT WAS MADE',
  like: 'Like',
  seeAll: 'See it all',
  keep: 'Keep',
  kept: 'Kept',
  hire: 'Hire',
} as const;

/** "Photographer · Cebu City": the byline's second line. */
export const SHOWCASE_BYLINE = `${SHOWCASE_POST.makerTitle} · ${SHOWCASE_POST.location}`;

export const SOURCES: readonly SourceEntry[] = [
  // The post itself: the compose form's placeholders and tag suggestions.
  { text: SHOWCASE.title, file: COMPOSE, mode: 'fragments', fragments: ['placeholder="Ten minutes before the rain"'] },
  {
    text: SHOWCASE.howItWasMade,
    file: COMPOSE,
    mode: 'fragments',
    fragments: ['placeholder="Backlit into the storm front so the rain read as light, not weather."'],
  },
  ...SHOWCASE.tags.map((tag): SourceEntry => ({ text: tag, file: COMPOSE, mode: 'fragments', fragments: [`'${tag}'`] })),
  { file: COMPOSE, mode: 'fragments', fragments: ['const TAG_SUGGESTIONS = ['] },

  // The placard.
  { text: SHOWCASE_CARD.craft, file: FEED, mode: 'verbatim' },
  { text: SHOWCASE_CARD.craft, file: WEB_FEED, mode: 'fragments', fragments: ['uppercase tracking-wide text-primary', 'How it was made'] },
  { text: SHOWCASE_CARD.like, file: FEED, mode: 'fragments', fragments: ["{item.likeCount > 0 ? item.likeCount : 'Like'}"] },
  { text: SHOWCASE_CARD.seeAll, file: FEED, mode: 'fragments', fragments: [": 'See it all'}"] },
  { text: SHOWCASE_CARD.keep, file: FEED, mode: 'fragments', fragments: ["{item.keptByMe ? 'Kept' : 'Keep'}"] },
  { text: SHOWCASE_CARD.hire, file: FEED, mode: 'fragments', fragments: ['<Text className="text-action-foreground text-[12px] font-bold">Hire</Text>'] },
  { text: SHOWCASE_BYLINE, file: FEED, mode: 'fragments', fragments: ['{maker.title}', "{item.location ? ` · ${item.location}` : ''}"] },
  // The cover: the screen's width, 1.15 times as tall.
  { file: FEED, mode: 'fragments', fragments: ['const height = Math.round(width * 1.15);'] },
];
