/**
 * The sky's camera: one true 3D perspective camera (storyboard §1.3, §1.13).
 *
 * World axes are x east, y up, z north (the geo scene, in map units) or x
 * west, y north, z toward Virgo (the deep-sky scene, in light-years). Both
 * are left-handed, like screen space: from a camera facing +z with +y up,
 * +x is on the right. A map viewBox point (x, y) is the world point
 * (x, 0, −y), so the map is the plane y = 0.
 *
 * Framework-free and allocation-light: `view()` resolves a camera against a
 * viewport into plain numbers once per frame, and `project()` writes into a
 * caller's object.
 */

export type Vec3 = readonly [number, number, number];

export type Camera = {
  readonly position: Vec3;
  readonly target: Vec3;
  /** Vertical field of view, degrees. */
  readonly fov: number;
  /**
   * Which way is up on screen. Defaults to +y; looking straight down along
   * it falls back to north (+z). `rig()` always sets it, so a camera that
   * pitches through vertical never flips.
   */
  readonly up?: Vec3;
  /**
   * Lens shift: where the target lands, as a fraction of the viewport from
   * its centre (x right, y down). The perspective is unchanged; the picture
   * slides, the way a shift lens frames a building without tilting it. Used
   * to keep a scene clear of copy (the hero on the left, a bottom sheet).
   */
  readonly shift?: readonly [number, number];
};

/** A camera resolved for one viewport, in CSS pixels. */
export type View = {
  px: number;
  py: number;
  pz: number;
  /** Right, up and forward unit vectors. */
  rx: number;
  ry: number;
  rz: number;
  ux: number;
  uy: number;
  uz: number;
  fx: number;
  fy: number;
  fz: number;
  /** Pixels per unit of x/z at depth 1: (height / 2) / tan(fov / 2). */
  focal: number;
  cx: number;
  cy: number;
  width: number;
  height: number;
  /** Distance from the camera to its target. */
  range: number;
};

export type Projected = { x: number; y: number; depth: number };

const RAD = Math.PI / 180;

export function view(cam: Camera, width: number, height: number, out: Partial<View> = {}): View {
  const [px, py, pz] = cam.position;
  let fx = cam.target[0] - px;
  let fy = cam.target[1] - py;
  let fz = cam.target[2] - pz;
  const range = Math.hypot(fx, fy, fz) || 1e-9;
  fx /= range;
  fy /= range;
  fz /= range;
  const [hx, hy, hz] = cam.up ?? [0, 1, 0];
  // right = up × forward (the left-handed order), falling back to north.
  let rx = hy * fz - hz * fy;
  let ry = hz * fx - hx * fz;
  let rz = hx * fy - hy * fx;
  let rl = Math.hypot(rx, ry, rz);
  if (rl < 1e-6) {
    // north × forward
    rx = -fy;
    ry = fx;
    rz = 0;
    rl = Math.hypot(rx, ry) || 1;
  }
  rx /= rl;
  ry /= rl;
  rz /= rl;
  const o = out as View;
  o.px = px;
  o.py = py;
  o.pz = pz;
  o.rx = rx;
  o.ry = ry;
  o.rz = rz;
  // up = forward × right.
  o.ux = fy * rz - fz * ry;
  o.uy = fz * rx - fx * rz;
  o.uz = fx * ry - fy * rx;
  o.fx = fx;
  o.fy = fy;
  o.fz = fz;
  o.focal = height / 2 / Math.tan((cam.fov * RAD) / 2);
  o.cx = width * (0.5 + (cam.shift?.[0] ?? 0));
  o.cy = height * (0.5 + (cam.shift?.[1] ?? 0));
  o.width = width;
  o.height = height;
  o.range = range;
  return o;
}

/**
 * A world point on screen. `depth` is the distance along the view direction;
 * at or below `near` the point is behind the camera and x/y are meaningless.
 */
export function project(v: View, x: number, y: number, z: number, out: Projected): Projected {
  const dx = x - v.px;
  const dy = y - v.py;
  const dz = z - v.pz;
  const depth = dx * v.fx + dy * v.fy + dz * v.fz;
  out.depth = depth;
  if (depth <= 1e-9) {
    out.x = out.y = NaN;
    return out;
  }
  const k = v.focal / depth;
  out.x = v.cx + (dx * v.rx + dy * v.ry + dz * v.rz) * k;
  out.y = v.cy - (dx * v.ux + dy * v.uy + dz * v.uz) * k;
  return out;
}

/** Screen pixels per world unit at the camera's target, for a surface facing the camera. */
export const pixelsPerUnit = (v: View) => v.focal / v.range;

// ─── The map plane ───────────────────────────────────────────────────────

/** A map crop in viewBox units, laid out at `scale` CSS px per unit. */
export type PlaneBox = { x: number; y: number; width: number; height: number; scale: number };

/**
 * The CSS `matrix3d` that puts an element showing the map crop `box` (its
 * top-left at the stage origin, `transform-origin: 0 0`) exactly where the
 * camera sees the plane y = 0: the plane's homography, so the map and the
 * canvas line up to the pixel. Null when the crop is wholly behind the camera.
 */
export function planeMatrix(v: View, box: PlaneBox): string | null {
  // Element pixel (u, w) is world (box.x + u / s, 0, −(box.y + w / s)).
  const s = 1 / box.scale;
  const dx = box.x - v.px;
  const dy = -v.py;
  const dz = -box.y - v.pz;
  // View coordinates are affine in (u, w): a·u + b·w + c.
  const ax = v.rx * s;
  const bx = -v.rz * s;
  const cx = dx * v.rx + dy * v.ry + dz * v.rz;
  const ay = v.ux * s;
  const by = -v.uz * s;
  const cy = dx * v.ux + dy * v.uy + dz * v.uz;
  const az = v.fx * s;
  const bz = -v.fz * s;
  const cz = dx * v.fx + dy * v.fy + dz * v.fz;
  // Any corner in front is enough to draw (the browser clips the rest).
  const w = box.width * box.scale;
  const h = box.height * box.scale;
  if (cz <= 0 && cz + az * w <= 0 && cz + bz * h <= 0 && cz + az * w + bz * h <= 0) return null;
  const f = v.focal;
  const h00 = f * ax + v.cx * az;
  const h01 = f * bx + v.cx * bz;
  const h02 = f * cx + v.cx * cz;
  const h10 = -f * ay + v.cy * az;
  const h11 = -f * by + v.cy * bz;
  const h12 = -f * cy + v.cy * cz;
  // Scale the whole homography so w stays near 1: better float precision in the compositor.
  const n = 1 / (Math.abs(cz) + Math.abs(az) * w + Math.abs(bz) * h || 1);
  const r = (x: number) => +(x * n).toPrecision(9);
  return `matrix3d(${r(h00)},${r(h10)},0,${r(az)},${r(h01)},${r(h11)},0,${r(bz)},0,0,1,0,${r(h02)},${r(h12)},0,${r(cz)})`;
}

// ─── Rigs, easing and keyframes ──────────────────────────────────────────

/** A camera described the way a cinematographer would: what it looks at, from how far, how steeply. */
export type Rig = {
  target: Vec3;
  /** Distance from the target, world units. */
  distance: number;
  /** Degrees below level: 90 looks straight down, 0 is level, negative looks up. */
  pitch: number;
  /** Compass heading faced, degrees: 0 faces +z (north), 90 faces +x (east). */
  heading: number;
  /** Vertical field of view, degrees. */
  fov: number;
  /** Lens shift (see Camera). Default [0, 0]. */
  shift?: readonly [number, number];
};

export function rig(r: Rig): Camera {
  const p = r.pitch * RAD;
  const h = r.heading * RAD;
  const cp = Math.cos(p);
  const sp = Math.sin(p);
  const sh = Math.sin(h);
  const ch = Math.cos(h);
  const fx = sh * cp;
  const fy = -sp;
  const fz = ch * cp;
  const [tx, ty, tz] = r.target;
  return {
    position: [tx - fx * r.distance, ty - fy * r.distance, tz - fz * r.distance],
    target: r.target,
    fov: r.fov,
    up: [sp * sh, cp, sp * ch],
    shift: r.shift,
  };
}

/**
 * A camera that stays where it is and turns: looking `pitch` degrees below
 * level toward `heading`. `range` is how far away its subject is; the sky
 * sizes and fogs stars relative to it.
 */
export function aim(position: Vec3, pitch: number, heading: number, fov: number, range = 40): Camera {
  const c = rig({ target: [0, 0, 0], distance: 1, pitch, heading, fov });
  const f = [-c.position[0], -c.position[1], -c.position[2]];
  return {
    position,
    target: [position[0] + f[0] * range, position[1] + f[1] * range, position[2] + f[2] * range],
    fov,
    up: c.up,
  };
}

/** A CSS cubic-bezier as a function of t in 0..1. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) {
      const d = (3 * ax * t + 2 * bx) * t + cx;
      if (Math.abs(d) < 1e-6) break;
      const next = t - (sx(t) - x) / d;
      if (next <= 0 || next >= 1) break;
      t = next;
    }
    // Bisection polish, for the flat ends where Newton stalls.
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 20 && Math.abs(sx(t) - x) > 1e-6; i++) {
      if (sx(t) < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return ((ay * t + by) * t + cy) * t;
  };
}

/** The camera curve: cubic-bezier(0.65, 0, 0.35, 1) (storyboard §1.7). */
export const easeCamera = cubicBezier(0.65, 0, 0.35, 1);

export const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Where t sits between a and b, clamped to 0..1. */
export const span = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
export const smoothstep = (a: number, b: number, t: number) => {
  const x = span(t, a, b);
  return x * x * (3 - 2 * x);
};

/**
 * Between two rigs, with log zoom: distance = exp(lerp(ln d0, ln d1, t)).
 * The target moves in world coordinates in step with the zoom, so whichever
 * end is close holds still on screen while the other end comes to it: a
 * push into Cebu keeps Cebu where it is and grows it, and a pull back from
 * Cebu keeps Cebu centred until the archipelago is in frame. Pass `linear`
 * for a plain lerp of the target. `t` is already eased.
 */
export function mixRig(a: Rig, b: Rig, t: number, target: 'zoom' | 'linear' = 'zoom'): Rig {
  const distance = Math.exp(lerp(Math.log(a.distance), Math.log(b.distance), t));
  let k = t;
  if (target === 'zoom' && Math.abs(a.distance - b.distance) > 1e-6 * Math.max(a.distance, b.distance)) {
    k = 1 - (distance - b.distance) / (a.distance - b.distance);
  }
  let dh = (b.heading - a.heading) % 360;
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  const sa = a.shift ?? NO_SHIFT;
  const sb = b.shift ?? NO_SHIFT;
  return {
    target: [lerp(a.target[0], b.target[0], k), lerp(a.target[1], b.target[1], k), lerp(a.target[2], b.target[2], k)],
    distance,
    pitch: lerp(a.pitch, b.pitch, t),
    heading: a.heading + dh * t,
    fov: lerp(a.fov, b.fov, t),
    shift: sa === sb ? sa : [lerp(sa[0], sb[0], t), lerp(sa[1], sb[1], t)],
  };
}

const NO_SHIFT = [0, 0] as const;

export type RigKey = { at: number; rig: Rig; target?: 'zoom' | 'linear'; ease?: (t: number) => number };

/**
 * A rig along keyframes at chapter progress `p` (each `at` in 0..1, in
 * order). Each leg eases with the camera curve unless it names its own.
 */
export function rigAt(keys: readonly RigKey[], p: number): Rig {
  if (p <= keys[0].at) return keys[0].rig;
  for (let i = 1; i < keys.length; i++) {
    const b = keys[i];
    if (p <= b.at) {
      const a = keys[i - 1];
      const t = (b.ease ?? easeCamera)(span(p, a.at, b.at));
      return mixRig(a.rig, b.rig, t, b.target);
    }
  }
  return keys[keys.length - 1].rig;
}

/** Vertical fov (degrees) that fits a w × h tangent-plane extent into a viewport with a margin on every side. */
export function fitFov(widthT: number, heightT: number, viewW: number, viewH: number, margin = 0.08): number {
  const focal = Math.min((viewW * (1 - 2 * margin)) / widthT, (viewH * (1 - 2 * margin)) / heightT);
  return (2 * Math.atan(viewH / 2 / focal)) / RAD;
}

/** A part of the viewport, in fractions of it: left, top, right, bottom. */
export type Rect = readonly [number, number, number, number];

/**
 * The fov and lens shift that fit a w × h tangent-plane extent, centred on
 * the camera's target, into one part of the viewport (`rect`), with `margin`
 * of that part kept clear on every side. The rest of the viewport still
 * shows sky, in the same perspective.
 */
export function fitRect(widthT: number, heightT: number, viewW: number, viewH: number, rect: Rect, margin = 0.08): { fov: number; shift: [number, number] } {
  const [l, t, r, b] = rect;
  const focal = Math.min((viewW * (r - l) * (1 - 2 * margin)) / widthT, (viewH * (b - t) * (1 - 2 * margin)) / heightT);
  return { fov: (2 * Math.atan(viewH / 2 / focal)) / RAD, shift: [(l + r) / 2 - 0.5, (t + b) / 2 - 0.5] };
}
