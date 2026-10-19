/**
 * Ch2 — Nearby: every word the chapter's three mocks draw.
 *
 * - `NearbyPhone`: the phone app's Nearby screen
 *   (`mobile/app/(app)/discover/nearby.tsx`).
 * - `NearbyPanel`: the web app's Nearby page
 *   (`web/src/app/(app)/nearby/page-client.tsx`), in the desktop layout.
 * - `LocationCard`: the "Share my location" card both of them open with, in
 *   its two real states.
 *
 * The two apps share their words almost exactly; where they differ (the
 * event chip's place, the distance template) each is listed. Every string is
 * proven in `SOURCES` against both files that draw it. People, counts and
 * distances are not strings: the mocks derive them from `story.ts`
 * (`rows()`, `roleCounts()`), never type them.
 *
 * A zero-import data module (see `../story.ts`).
 */
import { CLIENT, HOME, RADII, SEARCH_ROLES } from '../story';
import type { SourceEntry } from './common';

// ─── Words ───────────────────────────────────────────────────────────────

export const NEARBY = {
  title: 'Nearby',
  description: 'Freelancers and collaborators around you',
  share: 'Share my location',
  /** Sharing, with a city named rather than a device position. */
  on: `Discoverable · ${HOME.city}`,
  off: 'You are not discoverable',
  /** Shown under the switch while sharing is off. Proven verbatim, which is what lets it say "live". */
  cityHelp:
    'Would rather not share a live position? Name your city instead — it makes you findable to the same kilometre.',
  /** The city box's placeholder in that block. */
  cityPlaceholder: 'Cebu City',
  privacy:
    'Others see only how far away you are, never where you are. Turning this off erases your stored location straight away.',
  near: 'Near',
  backToMe: 'Back to my location',
  /** The helper while the search measures from where she is: before the shoot's chip is picked. */
  searching: 'Searching from where you are. Type a city to look somewhere else.',
  /** The helper once the search measures from a place: here, the shoot's city. */
  measuring: `Measuring from ${HOME.city}. This does not move you — you are still findable where you are.`,
  within: 'Within',
  lookingFor: 'Looking for',
  clear: 'Clear',
  /** The helper with the three roles picked. */
  anyoneWho: `Anyone who does ${SEARCH_ROLES.join(' or ')}.`,
  suggested: 'Suggested collaborators',
  add: 'Add',
} as const;

/** The upcoming shoot, offered as a place to search from. */
export const EVENT_CHIP = { title: CLIENT.event, place: HOME.city } as const;

/** The city Mika names in the card's "off" state, and the field it lands in. */
export const CITY_VALUE = HOME.city;

/**
 * The NEAR box's placeholder while it is empty: the viewer's own place
 * (`myPlace`), which for Mika is the city she shares.
 */
export const NEAR_PLACEHOLDER = HOME.city;

/** The radius choices, as both apps label them: `{r} km`. */
export const RADIUS_LABELS: readonly string[] = RADII.map((r) => `${r} km`);

/** A row's distance, as both apps write it: always whole kilometres. */
export function kmAway(km: number): string {
  return km < 1 ? 'under 1 km away' : `${km} km away`;
}

// ─── Sources ─────────────────────────────────────────────────────────────

const PHONE = 'mobile/app/(app)/discover/nearby.tsx';
const WEB = 'web/src/app/(app)/nearby/page-client.tsx';

/** One entry per app file that draws the string. */
const both = (text: string): SourceEntry[] => [
  { text, file: PHONE, mode: 'verbatim' },
  { text, file: WEB, mode: 'verbatim' },
];

export const SOURCES: readonly SourceEntry[] = [
  // The header (the web's is PageHeader's props, and under 1024 px the
  // shell's own bar repeats the page's name from AppShell's).
  { text: NEARBY.title, file: PHONE, mode: 'fragments', fragments: ['font-bold tracking-tight"> Nearby </Text>'] },
  { text: NEARBY.title, file: WEB, mode: 'fragments', fragments: ['title="Nearby"'] },
  { text: NEARBY.title, file: WEB, mode: 'fragments', fragments: ['<AppShell title="Nearby">'] },
  {
    text: NEARBY.title,
    file: 'web/src/components/app-shell.tsx',
    mode: 'fragments',
    fragments: ['lg:hidden">', "{title ?? 'Virgo'}", '<span className="hidden lg:inline-flex">'],
  },
  ...both(NEARBY.description),

  // The sharing card.
  ...both(NEARBY.share),
  { text: NEARBY.on, file: PHONE, mode: 'fragments', fragments: ['`Discoverable · ${myPlace}`'] },
  { text: NEARBY.on, file: WEB, mode: 'fragments', fragments: ['`Discoverable · ${myPlace}`'] },
  ...both(NEARBY.off),
  ...both(NEARBY.cityHelp),
  { text: NEARBY.cityPlaceholder, file: PHONE, mode: 'fragments', fragments: ['placeholder="Cebu City"'] },
  { text: NEARBY.cityPlaceholder, file: WEB, mode: 'fragments', fragments: ['placeholder="Cebu City"'] },
  ...both(NEARBY.privacy),

  // Near.
  { text: NEARBY.near, file: PHONE, mode: 'fragments', fragments: ['ml-1"> Near </Text>'] },
  { text: NEARBY.near, file: WEB, mode: 'fragments', fragments: ['text-muted-foreground"> Near </p>'] },
  ...both(NEARBY.backToMe),
  ...both(NEARBY.searching),
  { text: NEAR_PLACEHOLDER, file: PHONE, mode: 'fragments', fragments: ["placeholder={myPlace ?? 'Where you are'}"] },
  { text: NEAR_PLACEHOLDER, file: WEB, mode: 'fragments', fragments: ["placeholder={myPlace ?? 'Where you are'}"] },
  { text: EVENT_CHIP.title, file: PHONE, mode: 'fragments', fragments: ['{event.title}', '{place}', 'canonicalLocation(event.location'] },
  { text: EVENT_CHIP.place, file: WEB, mode: 'fragments', fragments: ['<span className="font-semibold">{event.title}</span>', '<span className="opacity-70">· {place}</span>'] },
  {
    text: NEARBY.measuring,
    file: PHONE,
    mode: 'fragments',
    fragments: ['`Measuring from ${searchPlace}. This does not move you — you are still findable where you are.`'],
  },
  {
    text: NEARBY.measuring,
    file: WEB,
    mode: 'fragments',
    fragments: ['`Measuring from ${searchPlace}. This does not move you — you are still findable where you are.`'],
  },

  // Within.
  { text: NEARBY.within, file: PHONE, mode: 'fragments', fragments: ['ml-1"> Within </Text>'] },
  { text: NEARBY.within, file: WEB, mode: 'fragments', fragments: ['text-muted-foreground"> Within </p>'] },
  { file: PHONE, mode: 'fragments', fragments: ['const RADII = [5, 25, 50, 100, 200];', '{r} km'] },
  { file: WEB, mode: 'fragments', fragments: ['const RADII = [5, 25, 50, 100, 200];', '{r} km'] },

  // Looking for.
  { text: NEARBY.lookingFor, file: PHONE, mode: 'fragments', fragments: ['ml-1"> Looking for </Text>'] },
  { text: NEARBY.lookingFor, file: WEB, mode: 'fragments', fragments: ['text-muted-foreground"> Looking for </p>'] },
  { text: NEARBY.clear, file: PHONE, mode: 'fragments', fragments: ['font-semibold">Clear</Text>'] },
  { text: NEARBY.clear, file: WEB, mode: 'fragments', fragments: ['> Clear </Button>'] },
  { text: NEARBY.anyoneWho, file: PHONE, mode: 'fragments', fragments: ["`Anyone who does ${roleFilter.join(' or ')}.`"] },
  { text: NEARBY.anyoneWho, file: WEB, mode: 'fragments', fragments: ["`Anyone who does ${roleFilter.join(' or ')}.`"] },

  // The results.
  { text: NEARBY.suggested, file: PHONE, mode: 'fragments', fragments: ['ml-1"> Suggested collaborators </Text>'] },
  { text: NEARBY.suggested, file: WEB, mode: 'fragments', fragments: ['text-muted-foreground"> Suggested collaborators </h2>'] },
  { text: kmAway(2), file: PHONE, mode: 'fragments', fragments: ["if (km < 1) return 'under 1 km away';", '`${km} km away`'] },
  { text: kmAway(2), file: WEB, mode: 'fragments', fragments: ["'under 1 km away' : `${person.distanceKm} km away`"] },
  { text: NEARBY.add, file: PHONE, mode: 'fragments', fragments: ['text-xs font-bold">Add</Text>'] },
  { text: NEARBY.add, file: WEB, mode: 'fragments', fragments: ['<UserPlus className="size-3.5" /> Add </Button>'] },
];
