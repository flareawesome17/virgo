import { MAP_LEVELS } from '../data/ph-map.generated';
import { MEDIA } from '../media.generated';
import type { MapLayerLevel } from '../sky/map-layer';

/**
 * The map's detail levels for the sky, built on the server. ph-map.generated.ts
 * also carries the land outline (about 10 KB gzip), so only server components
 * may import this module; the client gets the plain objects as props.
 */
const LAYOUT_SCALE: Record<(typeof MAP_LEVELS)[number]['id'], number> = { archipelago: 1.6, visayas: 6, cebu: 16, radar: 48 };

const SRC: Record<(typeof MAP_LEVELS)[number]['id'], string> = {
  archipelago: MEDIA.mapArchipelago.url,
  visayas: MEDIA.mapVisayas.url,
  cebu: MEDIA.mapCebu.url,
  radar: MEDIA.mapRadar.url,
};

export function mapLevels(): MapLayerLevel[] {
  return MAP_LEVELS.map((l) => ({ id: l.id, src: SRC[l.id], box: l.bbox, toleranceKm: l.toleranceKm, scale: LAYOUT_SCALE[l.id] }));
}
