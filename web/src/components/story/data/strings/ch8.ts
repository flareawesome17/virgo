/**
 * Ch8, Zoom Out: the profile tag beside Bea's star, and the nine role words
 * that drift across the sky.
 *
 * A zero-import data module (see `../story.ts`). The stats line under the tag
 * is the app's own `profileStatsLine`, which the mock calls directly; the
 * entries below prove its wording and the role list against the app.
 */
import { BEA_STATS, CAST, HOME, ROLES } from '../story';
import type { SourceEntry } from './common';

/** Who the tag names. Bea is 8 km from Mika, inside Cebu City. */
export const PROFILE_TAG = {
  name: CAST.bea.first,
  role: CAST.bea.roles[0],
  city: HOME.city,
  stats: BEA_STATS,
} as const;

/** "Bea · HMUA · Cebu City", joined the way the app joins a profile's facts. */
export const PROFILE_TAG_LINE = [PROFILE_TAG.name, PROFILE_TAG.role, PROFILE_TAG.city].join(' · ');

/** The nine roles, in the app's order: one marquee row on phones, two on desktop. */
export const MARQUEE_ROLES = ROLES;

/** The second row starts part-way round, so the two rows never line up word for word. */
export const MARQUEE_ROLES_B = [...ROLES.slice(4), ...ROLES.slice(0, 4)];

export const SOURCES: readonly SourceEntry[] = [
  ...ROLES.map((role): SourceEntry => ({ text: role, file: 'api/src/auth/roles.ts', mode: 'fragments', fragments: [`  '${role}',`] })),
  {
    file: 'web/src/api/profile-view.ts',
    mode: 'fragments',
    fragments: [
      "`${count(s.connections, 'connection', 'connections')} · ${count(s.jobsDone, 'job done', 'jobs done')}`",
    ],
  },
  // The web profile draws the stats line in 14 px semibold under the name.
  {
    file: 'web/src/app/(app)/u/[handle]/page-client.tsx',
    mode: 'fragments',
    fragments: ['<p className="mt-1 text-sm font-semibold">{profileStatsLine(person.stats)}</p>'],
  },
];
