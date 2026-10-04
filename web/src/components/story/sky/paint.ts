/**
 * Drawing the sky's two scenes into a 2D context. Stars are sprites
 * (`drawImage` only); lines, rings and threads are thin strokes. Everything
 * is projected with the frame's own camera, so it all stays locked together.
 * Every function counts its sprites against the frame's budget.
 */
import { project, smoothstep, type Projected, type View } from './camera';
import { F, MOTES, MOTE_STRIDE, STRIDE, type Cluster, type StarCloud } from './sky-seed';
import { sizeIndex, type SpriteSet } from './sprites';
import type { GeoState, Ring, StoryStar, Thread } from './types';

export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export type Painter = {
  g: Ctx;
  sprites: SpriteSet;
  /** Sprites drawn so far this frame, and the most allowed. */
  count: number;
  budget: number;
  /** Seconds, for the twinkle; frozen while paused. */
  time: number;
};

export const GOLD = '#F0C88E';
export const LINE = 'rgba(240,200,142,1)';
const a: Projected = { x: 0, y: 0, depth: 0 };
const b: Projected = { x: 0, y: 0, depth: 0 };

/** Which of a cloud's stars to draw: all (0), only the steady ones for the cache (1), or only the twinkling ones (2). */
export type Pass = 0 | 1 | 2;

export type CloudLook = {
  /** Drawn width per size class at the target's distance, CSS px. */
  base: readonly [number, number, number];
  opacity: number;
  dim?: GeoState['dimOuter'];
  twinkle: boolean;
  /** The dimmest fog lets a far star get, 0..1. Default 0.16. */
  floor?: number;
  /** A soft glow behind the large stars, at this share of their alpha. 0 or absent: none. */
  glow?: number;
  /**
   * The geo cloud: its city stars (three in every five, sky-seed.ts) are
   * people, so they draw warmer, a little larger and brighter, and pulse
   * slowly; the spread stars between them sit back as the quieter field.
   */
  people?: boolean;
};

/**
 * A packed cloud, in perspective: nearer than the camera's target draws
 * bigger and brighter (up to 2.6×), farther smaller and dimmer (fog), and a
 * star about to pass the camera fades rather than pops.
 */
export function paintCloud(p: Painter, v: View, cloud: StarCloud, look: CloudLook, pass: Pass): void {
  const d = cloud.data;
  const { g, sprites } = p;
  const range = v.range;
  const minDepth = range * 0.035;
  const w = v.width;
  const h = v.height;
  const dim = look.dim && look.dim.amount > 0 ? look.dim : null;
  const dimTo = dim ? 1 - 0.85 * dim.amount : 1;
  const r2 = dim ? dim.radius * dim.radius : 0;
  const t = p.time;
  const floor = look.floor ?? 0.16;
  const people = !!look.people;
  for (let i = 0, o = 0; i < cloud.count; i++, o += STRIDE) {
    const tw = look.twinkle && d[o + F.twinkle] === 1;
    if ((pass === 1 && tw) || (pass === 2 && !tw)) continue;
    const dx = d[o] - v.px;
    const dy = d[o + 1] - v.py;
    const dz = d[o + 2] - v.pz;
    const depth = dx * v.fx + dy * v.fy + dz * v.fz;
    if (depth < minDepth) continue;
    const k = v.focal / depth;
    const sx = v.cx + (dx * v.rx + dy * v.ry + dz * v.rz) * k;
    const sy = v.cy - (dx * v.ux + dy * v.uy + dz * v.uz) * k;
    const q = range / depth;
    const cue = Math.sqrt(q);
    const person = people && i % 5 < 3;
    const size = look.base[d[o + F.size]] * (cue < 0.5 ? 0.5 : cue > 2.6 ? 2.6 : cue) * (person ? 1.12 : people ? 0.9 : 1);
    const half = size / 2;
    if (sx < -half || sx > w + half || sy < -half || sy > h + half) continue;
    const fog = cue * 0.9;
    let alpha = d[o + F.bright] * look.opacity * (fog < floor ? floor : fog > 1 ? 1 : fog) * (person ? 1.12 : people ? 0.74 : 1);
    // Passing the camera: fade out between 12× and 28× nearer than the target.
    if (q > 12) alpha *= q > 28 ? 0 : (28 - q) / 16;
    if (dim) {
      const hx = d[o] - dim.center[0];
      const hz = d[o + 2] - dim.center[2];
      if (hx * hx + hz * hz > r2) alpha *= dimTo;
    }
    if (tw) {
      // People pulse slowly; the field between them twinkles.
      const ph = d[o + F.phase];
      alpha *= person ? 0.7 + 0.3 * Math.sin(ph + t * (0.55 + (ph % 0.7))) : 0.62 + 0.38 * Math.sin(ph + t * (1.2 + (ph % 1.4)));
    }
    if (alpha < 0.015) continue;
    if (p.count >= p.budget) return;
    if (look.glow && d[o + F.size] === 2 && alpha > 0.35 && p.count + 1 < p.budget) {
      // The brightest few carry a halo, so the field has a few stars that read first.
      const gs = size * (person ? 3 : 2.6);
      g.globalAlpha = Math.min(1, alpha * look.glow * (person ? 1.3 : 1));
      g.drawImage(sprites.glow, sx - gs / 2, sy - gs / 2, gs, gs);
      p.count++;
    }
    g.globalAlpha = alpha > 1 ? 1 : alpha;
    // A person's star: gold stays gold, warm white turns warm cream.
    const tint = person && d[o + F.tint] === 0 ? 2 : d[o + F.tint];
    g.drawImage(sprites.star[tint][sizeIndex(size)], sx - half, sy - half, size, size);
    p.count++;
  }
}

const LN_MOTE_RATIO = Math.log(MOTES.ratio);

/**
 * Near-field dust (§1.13, "a push streams near stars past the edges of the
 * frame"). Each layer's few points repeat in every tile of its size, so they
 * are fixed in the world and show true parallax; a layer is drawn only while
 * its tile is about a third of the camera's distance to its target, and each
 * mote fades in from deep and out as it nears the lens, so nothing pops.
 */
export function paintMotes(p: Painter, v: View, seeds: Float32Array, strength: number): void {
  if (strength <= 0.01) return;
  const g = p.g;
  const sprites = p.sprites.star[0];
  const w = v.width;
  const h = v.height;
  for (let k = 0; k < MOTES.layers; k++) {
    const P = MOTES.p0 * Math.pow(MOTES.ratio, k);
    const weight = Math.min(1, Math.max(0, 1.5 - Math.abs(Math.log(P / (0.3 * v.range)) / LN_MOTE_RATIO)));
    if (weight <= 0.02) continue;
    const near = 0.12 * P;
    const far = 2.2 * P;
    const x1 = Math.floor((v.px + far) / P);
    const y1 = Math.floor((v.py + far) / P);
    const z1 = Math.floor((v.pz + far) / P);
    const base = k * MOTES.perTile * MOTE_STRIDE;
    for (let ix = Math.floor((v.px - far) / P); ix <= x1; ix++) {
      // Only tiles above the ground: dust never sits under the map.
      for (let iy = Math.max(0, Math.floor((v.py - far) / P)); iy <= y1; iy++) {
        for (let iz = Math.floor((v.pz - far) / P); iz <= z1; iz++) {
          for (let m = 0, o = base; m < MOTES.perTile; m++, o += MOTE_STRIDE) {
            const wy = (iy + seeds[o + 1]) * P;
            if (wy < 0.3) continue;
            const dx = (ix + seeds[o]) * P - v.px;
            const dy = wy - v.py;
            const dz = (iz + seeds[o + 2]) * P - v.pz;
            const depth = dx * v.fx + dy * v.fy + dz * v.fz;
            if (depth < near || depth > far) continue;
            const kk = v.focal / depth;
            const sx = v.cx + (dx * v.rx + dy * v.ry + dz * v.rz) * kk;
            const sy = v.cy - (dx * v.ux + dy * v.uy + dz * v.uz) * kk;
            // Sized like a small object in the world, so the near ones are the big, fast ones.
            const raw = kk * P * 0.0072;
            const size = raw < 2.4 ? 2.4 : raw > 12 ? 12 : raw;
            if (sx < -size || sx > w + size || sy < -size || sy > h + size) continue;
            const alpha = 1.35 * strength * weight * seeds[o + 3] * smoothstep(near, 0.45 * P, depth) * (1 - smoothstep(1.3 * P, far, depth));
            if (alpha < 0.015) continue;
            if (p.count >= p.budget) return;
            g.globalAlpha = alpha > 1 ? 1 : alpha;
            g.drawImage(sprites[sizeIndex(size)], sx - size / 2, sy - size / 2, size, size);
            p.count++;
          }
        }
      }
    }
  }
}

/** A steady phase for a point, so each person's star breathes on its own beat. */
export function phaseOf(x: number, z: number): number {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return (s - Math.floor(s)) * Math.PI * 2;
}

/**
 * A person's star, over the plain one: a soft halo, then fine diffraction
 * spikes, then a hot white core, all breathing slowly on `phase` (the breath
 * holds while `p.time` does, under Pause). Up to three sprites.
 */
export function paintFeatured(p: Painter, x: number, y: number, size: number, alpha: number, featured: number, phase: number): void {
  const f = featured > 1 ? 1 : featured;
  if (f < 0.01 || alpha < 0.01 || p.count + 3 > p.budget) return;
  const breath = Math.sin(p.time * 0.9 + phase);
  const g = p.g;
  const hs = size * (3.4 + 0.25 * breath);
  g.globalAlpha = Math.min(1, alpha * f * (0.42 + 0.08 * breath));
  g.drawImage(p.sprites.glow, x - hs / 2, y - hs / 2, hs, hs);
  const ss = size * (2.9 + 0.5 * f) * (1 + 0.07 * breath);
  g.globalAlpha = Math.min(1, alpha * f * (0.78 + 0.18 * breath));
  g.drawImage(p.sprites.spike, x - ss / 2, y - ss / 2, ss, ss);
  const cs = size * 0.62;
  g.globalAlpha = Math.min(1, alpha * f * 0.9);
  g.drawImage(p.sprites.star[0][sizeIndex(cs)], x - cs / 2, y - cs / 2, cs, cs);
  p.count += 3;
}

/** Story stars: size follows the same depth cue; a halo blooms behind on request; people carry spikes. */
export function paintStars(p: Painter, v: View, stars: readonly StoryStar[], opacity: number): void {
  for (const s of stars) {
    project(v, s.world[0], s.world[1], s.world[2], a);
    if (!(a.depth > v.range * 0.01)) continue;
    const cue = Math.min(2.6, Math.max(0.5, Math.sqrt(v.range / a.depth)));
    const size = s.size * cue;
    const alpha = s.alpha * opacity;
    const halo = !!s.halo && s.halo > 0.01;
    if (alpha < 0.01 || p.count + (halo ? 2 : 1) > p.budget) continue;
    if (halo) {
      const hs = size * 4.2;
      p.g.globalAlpha = Math.min(1, alpha * (s.halo ?? 0));
      p.g.drawImage(p.sprites.glow, a.x - hs / 2, a.y - hs / 2, hs, hs);
      p.count++;
    }
    p.g.globalAlpha = Math.min(1, alpha);
    p.g.drawImage(p.sprites.star[s.tint ?? 0][sizeIndex(size)], a.x - size / 2, a.y - size / 2, size, size);
    p.count++;
    if (s.featured) paintFeatured(p, a.x, a.y, size, alpha, s.featured, phaseOf(s.world[0], s.world[2]));
  }
}

/**
 * Projects a segment, cutting it at a small depth in front of the camera so
 * a line that passes behind it stays a line. False when none of it shows.
 */
function segment(v: View, ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
  const near = v.range * 0.01;
  const da = (ax - v.px) * v.fx + (ay - v.py) * v.fy + (az - v.pz) * v.fz;
  const db = (bx - v.px) * v.fx + (by - v.py) * v.fy + (bz - v.pz) * v.fz;
  if (da < near && db < near) return false;
  if (da < near) {
    const t = (near - da) / (db - da);
    ax += (bx - ax) * t;
    ay += (by - ay) * t;
    az += (bz - az) * t;
  } else if (db < near) {
    const t = (near - db) / (da - db);
    bx += (ax - bx) * t;
    by += (ay - by) * t;
    bz += (az - bz) * t;
  }
  project(v, ax, ay, az, a);
  project(v, bx, by, bz, b);
  return true;
}

export function stroke(g: Ctx, alpha: number, width: number, colour: string) {
  g.globalAlpha = Math.min(1, alpha);
  g.lineWidth = width;
  g.strokeStyle = colour;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.stroke();
}

/** Threads of light: straight 3D segments, drawn from a toward b. */
export function paintThreads(p: Painter, v: View, threads: readonly Thread[], opacity: number): void {
  for (const th of threads) {
    const t = th.progress ?? 1;
    const alpha = th.alpha * opacity;
    if (t <= 0 || alpha < 0.01) continue;
    const [ax, ay, az] = th.a;
    const bx = ax + (th.b[0] - ax) * t;
    const by = ay + (th.b[1] - ay) * t;
    const bz = az + (th.b[2] - az) * t;
    if (!segment(v, ax, ay, az, bx, by, bz)) continue;
    p.g.beginPath();
    p.g.moveTo(a.x, a.y);
    p.g.lineTo(b.x, b.y);
    stroke(p.g, alpha, th.width ?? 1.25, th.color ?? LINE);
  }
}

/** Rings lying in the plane of their centre's height: a ripple on water, seen at the camera's angle. */
export function paintRings(p: Painter, v: View, rings: readonly Ring[], opacity: number): void {
  const N = 120;
  for (const ring of rings) {
    const t = ring.progress ?? 1;
    const alpha = ring.alpha * opacity;
    if (t <= 0 || alpha < 0.01) continue;
    const [cx, cy, cz] = ring.center;
    const steps = Math.ceil(N * t);
    const g = p.g;
    g.beginPath();
    let open = false;
    let px = cx;
    let pz = cz + ring.radius;
    for (let i = 1; i <= steps; i++) {
      const th = (Math.min(i, N * t) / N) * Math.PI * 2;
      const x = cx + Math.sin(th) * ring.radius;
      const z = cz + Math.cos(th) * ring.radius;
      if (segment(v, px, cy, pz, x, cy, z)) {
        if (!open) g.moveTo(a.x, a.y);
        g.lineTo(b.x, b.y);
        open = true;
      } else open = false;
      px = x;
      pz = z;
    }
    stroke(g, alpha, ring.width ?? 1.5, ring.color ?? LINE);
  }
}

/**
 * Ch8's small constellations: each lights as the north-to-south wave
 * reaches it, with a faint thread of light down to its city. Each crew's
 * stars are people, so they read as clear warm points with a glow of their
 * own; a crew flares once as it lights, then breathes.
 */
export function paintClusters(p: Painter, v: View, list: readonly Cluster[], wave: number, opacity: number): void {
  const g = p.g;
  for (const c of list) {
    const lit = smoothstep(c.wave * 0.72, c.wave * 0.72 + 0.28, wave);
    const r = lit * opacity;
    if (r < 0.01) continue;
    // The flare as it lights: 0 before, a peak half way, 0 once lit.
    const flare = Math.sin(Math.PI * lit) * opacity;
    let mx = 0;
    let my = 0;
    let mz = 0;
    for (const s of c.stars) {
      mx += s[0];
      my += s[1];
      mz += s[2];
    }
    const n = c.stars.length;
    mx /= n;
    my /= n;
    mz /= n;
    // The thread down to the ground, then the figure's lines.
    if (segment(v, c.ground[0], 0, c.ground[2], mx, my - 1.2, mz)) {
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      stroke(g, 0.22 * r, 1, LINE);
    }
    g.beginPath();
    for (const [i, j] of c.lines) {
      const si = c.stars[i];
      const sj = c.stars[j];
      if (!segment(v, si[0], si[1], si[2], sj[0], sj[1], sj[2])) continue;
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
    }
    stroke(g, (0.6 + 0.3 * flare) * r, 1, LINE);
    if (p.count >= p.budget) continue;
    // A glow at the heart, then the stars.
    project(v, mx, my, mz, a);
    if (a.depth > 0) {
      const gs = Math.min(160, Math.max(36, (v.focal / a.depth) * 26)) * (1 + 0.6 * flare);
      g.globalAlpha = Math.min(1, (0.32 + 0.4 * flare) * r);
      g.drawImage(p.sprites.glow, a.x - gs / 2, a.y - gs / 2, gs, gs);
      p.count++;
    }
    const breath = 1 + 0.06 * Math.sin(p.time * 0.8 + c.wave * 9);
    c.stars.forEach((s, i) => {
      if (p.count + 2 > p.budget) return;
      project(v, s[0], s[1], s[2], a);
      if (!(a.depth > 0)) return;
      const size = 9.5 * Math.min(1.8, Math.max(0.75, Math.sqrt(v.range / a.depth))) * breath;
      // A small glow of its own, so each person reads as a point, not a dot of the line.
      const gs = size * 2.8;
      g.globalAlpha = Math.min(1, (0.3 + 0.35 * flare) * r);
      g.drawImage(p.sprites.glow, a.x - gs / 2, a.y - gs / 2, gs, gs);
      g.globalAlpha = Math.min(1, r);
      g.drawImage(p.sprites.star[i === 0 ? 1 : 2][sizeIndex(size)], a.x - size / 2, a.y - size / 2, size, size);
      p.count += 2;
    });
  }
}
