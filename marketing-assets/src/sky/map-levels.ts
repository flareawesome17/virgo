/**
 * G-b's four map levels (marketing-assets/assets/map/, the SVGs publish.mjs
 * ships to the page), with their crops and tolerances from
 * ph-map.generated.ts. The bundler turns each import into a URL.
 */
import archipelago from "../../assets/map/archipelago.svg";
import cebu from "../../assets/map/cebu.svg";
import radar from "../../assets/map/radar.svg";
import visayas from "../../assets/map/visayas.svg";
import { MAP_LEVELS } from "../site";
import type { StillLevel } from "./still-sky";

const SRC: Record<(typeof MAP_LEVELS)[number]["id"], string> = { archipelago, visayas, cebu, radar };

/** Never lay a level out wider or taller than this, px: well inside Chrome's texture limits. */
const MAX_SIDE = 8192;

/**
 * Every level, laid out at `pxPerUnit` device pixels per map unit (the most
 * the frame magnifies the plane, with headroom), so Chrome rasterises each
 * SVG once at a size it only ever scales down from.
 */
export function stillLevels(pxPerUnit: number): StillLevel[] {
  return MAP_LEVELS.map((l) => {
    const side = Math.max(l.bbox.width, l.bbox.height);
    const scale = Math.min(pxPerUnit, MAX_SIDE / side);
    return { id: l.id, src: SRC[l.id], toleranceKm: l.toleranceKm, box: { ...l.bbox, scale } };
  });
}
