/**
 * The story map, as the sky seed takes it (sky-seed.ts `SeedMap`). The seed
 * imports nothing itself, so it runs under plain Node; the page, the lab and
 * Remotion pass this, built from the same two generated modules the map and
 * the city table use. check-seed.mjs builds the same object in Node and pins
 * the hashes it produces.
 */
import { CITIES, KM_PER_UNIT } from '../data/cities.generated';
import { VIEWBOX } from '../data/projection';
import type { SeedMap } from './sky-seed';

export const SEED_MAP: SeedMap = { cities: CITIES, kmPerUnit: KM_PER_UNIT, viewBox: VIEWBOX };
