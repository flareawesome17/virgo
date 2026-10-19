/**
 * Fixed places in the sky's two worlds, shared by every chapter that frames
 * them: where the cast's stars hang over Cebu City, and where to stand to
 * see Virgo form.
 */
import { HOME, offsetKm } from '../data/cities.generated';
import { STARS } from '../data/constellation';
import { CAST, ROSTER } from '../data/story';
import { fitRect, type Rect, type Rig, type Vec3 } from './camera';

/** How high the story's own stars hang over their places, map units (about 1.5 km). */
export const STORY_ALT = 0.8;

/** A map viewBox point (x east, y down) at an altitude, as a world point. */
export const geoPoint = (x: number, y: number, alt = 0): Vec3 => [x, alt, -y];

/** Where each of the cast is: Mika in Cebu City, the others at their story.ts distance and bearing from her. */
export const CAST_WORLD = Object.fromEntries(
  Object.values(CAST).map((m) => {
    const p = m.offset.km ? offsetKm(HOME.x, HOME.y, m.offset.km, m.offset.bearing) : { x: HOME.x, y: HOME.y };
    return [m.id, geoPoint(p.x, p.y, STORY_ALT)];
  }),
) as Record<keyof typeof CAST, Vec3>;

/** Cebu City on the ground. */
export const HOME_GROUND = geoPoint(HOME.x, HOME.y);

/**
 * Everyone in the illustrative Nearby roster (story.ts ROSTER) as a star over
 * their place: their whole-km distance and bearing from Mika, on the app's
 * own sphere (offsetKm). Ch2's rings open around these; the Prologue's last
 * frame already shows them faintly, so the people are there before anyone
 * searches. Ernie, Kenn and Bea are the same points as CAST_WORLD.
 */
export const ROSTER_WORLD: readonly { readonly name: string; readonly km: number; readonly world: Vec3; readonly erased: boolean }[] = ROSTER.map((n) => {
  const p = offsetKm(HOME.x, HOME.y, n.km, n.bearing);
  return { name: n.name, km: n.km, world: geoPoint(p.x, p.y, STORY_ALT), erased: !!n.erased };
});

// ─── Virgo ───────────────────────────────────────────────────────────────

const gxs = STARS.map((s) => s.gx);
const gys = STARS.map((s) => s.gy);
/** The figure's extent on the tangent plane, and its centre there. */
export const FIGURE_SPAN = {
  width: Math.max(...gxs) - Math.min(...gxs),
  height: Math.max(...gys) - Math.min(...gys),
  cx: (Math.max(...gxs) + Math.min(...gxs)) / 2,
  cy: (Math.max(...gys) + Math.min(...gys)) / 2,
};

/** The figure's mean distance, light-years: what an orbit turns about. */
export const VIRGO_DEPTH = STARS.reduce((t, s) => t + s.pos[2], 0) / STARS.length;

/** The point on the figure's line of sight at that depth (deep-sky frame: x west, y north, z toward Virgo). */
export const VIRGO_PIVOT: Vec3 = [FIGURE_SPAN.cx * VIRGO_DEPTH, -FIGURE_SPAN.cy * VIRGO_DEPTH, VIRGO_DEPTH];

const RAD = 180 / Math.PI;
const pivotLength = Math.hypot(...VIRGO_PIVOT);

/** Where on screen the figure goes: a part of the viewport, and the margin kept inside it. */
export type Framing = { rect?: Rect; margin?: number };

/**
 * Standing on Earth, looking at Virgo: the only place the 14 stars make the
 * figure. The figure fits `rect` (the whole viewport by default) with
 * `margin` of it clear on every side; the lens shift puts it there, so the
 * perspective, and so the figure, is exactly Earth's.
 */
export function earthRig(viewW: number, viewH: number, { rect = [0, 0, 1, 1], margin = 0.1 }: Framing = {}): Rig {
  const { fov, shift } = fitRect(FIGURE_SPAN.width, FIGURE_SPAN.height, viewW, viewH, rect, margin);
  return {
    target: VIRGO_PIVOT,
    distance: pivotLength,
    pitch: -Math.asin(VIRGO_PIVOT[1] / pivotLength) * RAD,
    heading: Math.atan2(VIRGO_PIVOT[0], VIRGO_PIVOT[2]) * RAD,
    fov,
    shift,
  };
}

/**
 * Off to one side of the line of sight, where the same stars are a
 * shapeless scatter. Orbit from here to `earthRig` and they line up.
 */
export function offAxisRig({
  heading = 78,
  pitch = -16,
  distance = 420,
  fov = 50,
  shift,
}: { heading?: number; pitch?: number; distance?: number; fov?: number; shift?: readonly [number, number] } = {}): Rig {
  return { target: VIRGO_PIVOT, distance, pitch, heading, fov, shift };
}
