import { CAST, HIRED } from '../../data/story';
import { ROLE_GEAR, type GearKind } from '../cinema/gear';

/**
 * The credits' crew, by role, each with its tool (05-cinema.md §1.7, §3):
 * first names and roles as the cast data names them (story.ts), so the
 * credits never say anything the film did not. Plain data, server-safe:
 * the static Finale and the client scene both read it.
 */
export const CREW: readonly { first: string; role: string; gear: GearKind }[] = [
  { first: CAST.mika.first, role: CAST.mika.roles[0], gear: ROLE_GEAR.photographer },
  { first: CAST.ernie.first, role: HIRED.ernie.role, gear: ROLE_GEAR.videographer },
  { first: CAST.kenn.first, role: HIRED.kenn.role, gear: ROLE_GEAR.editor },
  { first: CAST.bea.first, role: HIRED.bea.role, gear: ROLE_GEAR.hmua },
];
