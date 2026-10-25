import type { PlacePrecision } from './places';

/**
 * How closely somebody is placed: a device position, a town's centre, or a
 * province's capital standing in for their town.
 */
export type PositionPrecision = 'gps' | PlacePrecision;

/**
 * For each way of being placed, how far from the point a distance starts to
 * mean anything (`below`, km), and the step it is stated in (`step`, km).
 *
 * - gps: kept to a cell of 0.01°, about 1.1 km (POSITION_DECIMALS in
 *   discover.service.ts). The deliberate privacy rounding. Each end can be up
 *   to 0.8 km from its cell's centre, so a distance between two cells is good
 *   to about half a kilometre: whole kilometres, and "under 1 km" inside one.
 * - city: a town's centre. People live around it, not on it, so within a few
 *   kilometres of it somebody is "in" the town rather than a distance away.
 * - province: the capital standing in for every other town in the province.
 *   Within 50 km of it they could be anywhere in the province. Beyond that the
 *   figure is good to tens of kilometres, not to one.
 */
const STATED: Record<PositionPrecision, { below: number; step: number }> = {
  gps: { below: 1, step: 1 },
  city: { below: 3, step: 1 },
  province: { below: 50, step: 10 },
};

/**
 * The distance to somebody as Nearby states it: no finer than the two
 * positions allow, and 0 when it is too short to mean anything.
 *
 * 0 is what the apps, installed and current, already read as "In Plaridel,
 * Misamis Occidental" for a town or a province and "under 1 km away" for a
 * device. So it is the answer for "too close to tell" rather than a new flag,
 * and an app that predates this states every distance correctly too.
 *
 * `origin` is how the searcher is placed. Null for a city typed into "Near":
 * the search is from that exact centre, which adds nothing to the doubt.
 * It is ignored for a device at the far end, whose 0 would read "under 1 km
 * away" with no town to fall back on; a searcher placed only by their
 * province is told on their own status card that distances are rough.
 *
 * Never metres or tenths of a kilometre. The finest anybody is placed is a
 * 1.1 km cell, on purpose, so "400 m" or "2.3 km" would look precise and be
 * wrong. Rounding adds no privacy beyond that cell: the cell is what can be
 * worked out from enough searches either way.
 */
export function statedDistanceKm(
  exactKm: number,
  target: PositionPrecision,
  origin: PositionPrecision | null,
): number {
  const far = STATED[target];
  const near = target === 'gps' || origin === null ? far : STATED[origin];
  const below = Math.max(far.below, near.below);
  const step = Math.max(far.step, near.step);
  if (!(exactKm >= below)) return 0;
  return Math.round(exactKm / step) * step;
}
