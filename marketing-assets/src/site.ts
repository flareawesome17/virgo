/**
 * The story site's own data and sky code, imported by relative path and never
 * copied, so every still and video draws the page's numbers with the page's
 * painter: the same seed, the same 71 cities, the same projection, the same
 * sprites. One file, so a move on the web side is fixed in one place.
 *
 * Everything here is framework-free (the zero-import data modules, and the
 * sky's camera, painter and sprites), so it runs in Remotion's Chrome as it
 * runs on the page.
 */
export { KM_PER_UNIT, VIEWBOX } from "../../web/src/components/story/data/projection";
export { CITIES, HOME, offsetKm } from "../../web/src/components/story/data/cities.generated";
export {
  CAST_STARS,
  HELD_BACK,
  SEGMENTS,
  STARS,
  starRadius,
  type StarId,
  type VirgoStar,
} from "../../web/src/components/story/data/constellation";
export { CAST } from "../../web/src/components/story/data/story";
export { MAP_FILL, MAP_LEVELS } from "../../web/src/components/story/data/ph-map.generated";

export {
  COUNTS,
  F,
  SEED,
  STRIDE,
  deepField,
  hashStars,
  motes,
  mulberry32,
  starCloud,
  type SkyVariant,
  type StarCloud,
} from "../../web/src/components/story/sky/sky-seed";
export { SEED_MAP } from "../../web/src/components/story/sky/seed-map";
export { CLUSTERS } from "../../web/src/components/story/sky/clusters.generated";
export {
  easeCamera,
  pixelsPerUnit,
  planeMatrix,
  project,
  rig,
  smoothstep,
  span,
  view,
  type Camera,
  type PlaneBox,
  type Projected,
  type Rig,
  type Vec3,
  type View,
} from "../../web/src/components/story/sky/camera";
export {
  GOLD,
  LINE,
  paintCloud,
  paintClusters,
  paintMotes,
  paintRings,
  paintStars,
  paintThreads,
  stroke,
  type CloudLook,
  type Painter,
} from "../../web/src/components/story/sky/paint";
export { makeSprites, sizeIndex, type SpriteSet } from "../../web/src/components/story/sky/sprites";
export { CAST_WORLD, FIGURE_SPAN, VIRGO_PIVOT, earthRig } from "../../web/src/components/story/sky/scenes";
export type { GeoState, LabelState, SkyFrame, StoryStar } from "../../web/src/components/story/sky/types";

/**
 * The page's camera work, as the sky lab prototypes it for Phase 4: the
 * Prologue's descent and Ch8's crane up, functions of chapter progress. The
 * posters are the Prologue at p = 0, the lens its landing, and the clusters
 * still the crane's last frame. When the choreography moves out of the lab,
 * point this one line at its new home.
 */
export { CITY_LABELS, clustersFor, crane, prologue, type Layout } from "../../web/src/app/(marketing)/story-lab/sky/choreography";
