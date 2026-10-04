/**
 * Ch2's sky: the radar (storyboard Ch2 timeline, §1.13 "a ripple on water").
 *
 * The camera eases from where the Prologue left Mika to a radar framing, a
 * 5 km ring opens on the tilted map plane and the stars inside it brighten;
 * the camera pulls back 5× so the 25 km ring reads at the same size; each lit
 * star smears into a thin ring at its distance (distance, not direction); the
 * coordinator 3 km out is gone in one frame; the rings fade back into stars.
 *
 * `p` is the chapter's own clock, 0..1 over its track (values outside are
 * clamped, so the sky holds its first frame while the chapter enters).
 */
import { KM_PER_UNIT } from '@/components/story/data/projection';
import { rig, rigAt, smoothstep, span, type Rig, type RigKey, type Vec3 } from '@/components/story/sky/camera';
import { CAST_WORLD, ROSTER_WORLD } from '@/components/story/sky/scenes';
import type { GeoState, Ring, SkyFrame, StoryStar, Thread } from '@/components/story/sky/types';
import type { Layout } from './choreography';

const MIKA = CAST_WORLD.mika;
const GROUND: Vec3 = [MIKA[0], 0, MIKA[2]];
const unit = (km: number) => km / KM_PER_UNIT;
const GOLD = '#F0C88E';

/** Where the beats fall on the chapter clock. Islands read these to flip the panel in step with the sky. */
export const NEARBY_AT = {
  /** NEAR picks the shoot's city. */
  near: 0.05,
  /** The 5 km ring opens. */
  r5: 0.12,
  /** The camera pulls back to 25 km. */
  r25: 0.34,
  /** Distance, not direction. */
  smear: 0.54,
  /** The coordinator turns sharing off: gone in one frame. */
  erase: 0.74,
  /** The rings condense back into stars. */
  condense: 0.86,
} as const;

/** The radar framing for a radius: the ring fills the free part of the screen at the same size at 5 or 25 km. */
function radarRig(km: number, l: Layout): Rig {
  const r = unit(km);
  return l.mobile
    ? // Phones: the radar's centre sits high (about a third down), clear of the phone rising below it.
      { target: GROUND, distance: r * 5.4, pitch: 62, heading: 14, fov: 48, shift: [0, -0.22] }
    : // Desktop: the left 55%, beside the sticky panel.
      { target: GROUND, distance: r * 3.7, pitch: 54, heading: 14, fov: 42, shift: [-0.21, 0.02] };
}

function keys(l: Layout): RigKey[] {
  const start: Rig = l.mobile
    ? { target: MIKA, distance: 17, pitch: 46, heading: 22, fov: 46 }
    : { target: MIKA, distance: 15, pitch: 46, heading: 22, fov: 42 };
  const r25 = radarRig(25, l);
  return [
    { at: 0, rig: start },
    { at: NEARBY_AT.r5, rig: radarRig(5, l) },
    { at: NEARBY_AT.r25 - 0.02, rig: radarRig(5, l) },
    { at: NEARBY_AT.r25 + 0.14, rig: r25 },
    { at: NEARBY_AT.condense, rig: r25 },
    // The hand-off: a breath back and up, so Ch3's pull-back starts from rest.
    { at: 1, rig: { ...r25, distance: r25.distance * 1.08, pitch: r25.pitch - 4 } },
  ];
}

/** A ring on the ground around the shoot. */
const ring = (km: number, alpha: number, progress = 1, width = 1.4, color = GOLD): Ring => ({
  center: GROUND,
  radius: unit(km),
  alpha,
  progress,
  width,
  color,
});

export function nearby(raw: number, l: Layout): SkyFrame {
  const p = raw < 0 ? 0 : raw > 1 ? 1 : raw;
  const open5 = smoothstep(NEARBY_AT.r5, NEARBY_AT.r5 + 0.1, p);
  const open25 = smoothstep(NEARBY_AT.r25 + 0.02, NEARBY_AT.r25 + 0.16, p);
  /** How far out the search reaches right now, km: what lights the stars. */
  const reach = 5 * open5 + 20 * open25;
  const smear = smoothstep(NEARBY_AT.smear, NEARBY_AT.smear + 0.06, p) * (1 - smoothstep(NEARBY_AT.condense, 0.97, p));
  const erased = p >= NEARBY_AT.erase;
  const settle = smoothstep(NEARBY_AT.condense, 1, p);

  const rings: Ring[] = [];
  if (open5 > 0.001) {
    // The ripple that runs out as a ring opens, then the ring itself, drawn round from north.
    const run5 = span(p, NEARBY_AT.r5, NEARBY_AT.r5 + 0.14);
    if (run5 < 1) rings.push(ring(5 * run5, 0.5 * (1 - run5), 1, 1));
    rings.push(ring(5, (0.9 - 0.4 * open25) * (1 - 0.6 * settle), open5));
  }
  if (open25 > 0.001) {
    const run25 = span(p, NEARBY_AT.r25 + 0.02, NEARBY_AT.r25 + 0.2);
    if (run25 < 1) rings.push(ring(5 + 20 * run25, 0.45 * (1 - run25), 1, 1));
    rings.push(ring(25, 0.9 * (1 - 0.6 * settle), open25));
  }

  const stars: StoryStar[] = [{ world: MIKA, size: 15, tint: 1, alpha: 1, halo: 0.55 + 0.45 * open5 }];
  const threads: Thread[] = [];
  // Phones smear one star only (Bea, 8 km out): one ring reads; ten would be noise at 375 px.
  const smearOne = l.mobile;
  for (const n of ROSTER_WORLD) {
    if (n.km > 60) continue;
    if (n.erased && erased) continue; // Erased, not hidden: absent from this frame on.
    const lit = smoothstep(n.km - 0.6, n.km + 0.6, reach);
    const dim = 1 - 0.45 * smear;
    stars.push({ world: n.world, size: 8.5 + 3 * lit, tint: 0, alpha: (0.3 + 0.7 * lit) * dim, halo: 0.35 * lit * (1 - smear) });
    if (lit > 0.5 && smear > 0.001 && (!smearOne || n.name === 'Bea')) {
      rings.push(ring(n.km, 0.32 * smear * lit, 1, 0.9, '#F7EFE6'));
      // A hairline from the shoot to the ring, never to the person: a distance has no direction.
    }
  }

  const geo: GeoState = {
    camera: rig(rigAt(keys(l), p)),
    opacity: 1,
    map: 0.075 * (1 - 0.6 * smear),
    dimOuter: { center: MIKA, radius: Math.max(4, unit(reach) * 1.25), amount: 0.55 * open5 * (1 - settle) },
    stars,
    rings,
    threads,
  };
  return { geo };
}
