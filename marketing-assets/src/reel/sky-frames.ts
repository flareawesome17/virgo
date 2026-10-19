/**
 * The reel's camera work and sky states, built from the page's own pieces
 * (camera.ts rigs with log zoom, scenes.ts' cast and roster placed by
 * offsetKm, the Virgo figure at its real distances). The page's lab
 * choreography paces each leg to scroll and rests at every key; a reel has
 * no reader to stop, so these legs run on one continuous curve instead.
 */
import { mixRig, rigAt, type Rig, type RigKey } from "../../../web/src/components/story/sky/camera";
import { ROSTER_WORLD, earthRig, offAxisRig } from "../../../web/src/components/story/sky/scenes";
import type { DeepState, Ring, Thread } from "../../../web/src/components/story/sky/types";
import { CAST_STARS, CAST_WORLD, KM_PER_UNIT, rig, smoothstep, type GeoState, type StoryStar, type Vec3 } from "../site";
import { SKY_CSS } from "./sky";

export const MIKA = CAST_WORLD.mika;

/** Where the Prologue lands on a phone (choreography.ts LANDED, mobile): south-west of Mika, looking north-north-east. */
export const LANDED: Rig = { target: MIKA, distance: 17, pitch: 46, heading: 22, fov: 46 };

const linear = (t: number) => t;
/** Keys on one curve: every leg linear, so the caller's single ease shapes the whole move. */
export const path = (keys: readonly { at: number; rig: Rig }[], t: number): Rig =>
  rigAt(
    keys.map((k): RigKey => ({ ...k, ease: linear })),
    t,
  );

/** Distance at which a fov frames w × h map units on the reel's portrait sky (choreography.ts frameDistance). */
function frameDistance(w: number, h: number, fov: number, margin = 1.06): number {
  const t = Math.tan((fov * Math.PI) / 360);
  return Math.max(h / (2 * t), w / (2 * t * (SKY_CSS.width / SKY_CSS.height))) * margin;
}

/** S1: from the whole archipelago down through the stars onto Mika (the Prologue's descent, phone framing). */
export const S1_KEYS = [
  { at: 0, rig: { target: [296, 0, -520] as Vec3, distance: frameDistance(591.6, 1000, 60, 1.12), pitch: 89, heading: 0, fov: 60 } },
  { at: 0.3, rig: { target: [404, 0, -640] as Vec3, distance: frameDistance(270, 250, 56), pitch: 82, heading: 6, fov: 56 } },
  { at: 0.78, rig: { target: [MIKA[0], 0.4, MIKA[2]] as Vec3, distance: 30, pitch: 56, heading: 16, fov: 46 } },
  { at: 1, rig: LANDED },
] as const;

const NEIGHBOURS = ROSTER_WORLD.filter((n) => !["Ernie", "Kenn", "Bea"].includes(n.name));

export type StarLook = {
  /** Mika's gold star: its alpha and halo. */
  readonly mika: number;
  readonly halo: number;
  /** The crew's three stars. */
  readonly crew: number;
  /** The rest of the roster, faint. */
  readonly roster: number;
  /** Within this many km the roster burns brighter (Ch2's ring), and how much. */
  readonly within?: { readonly km: number; readonly lift: number };
  /** The privacy beat: the coordinator has turned sharing off and is not there. */
  readonly erased?: boolean;
  /** Mika's star size, CSS px. */
  readonly mikaSize?: number;
};

/** Mika, the crew and the Nearby roster as story stars (choreography.ts castStars, with Ch2's ring lift). */
export function castStars(look: StarLook): StoryStar[] {
  const lift = (km: number) => (look.within ? look.within.lift * (1 - smoothstep(look.within.km - 0.6, look.within.km + 0.6, km)) : 0);
  const stars: StoryStar[] = [
    { world: MIKA, size: look.mikaSize ?? 15, tint: 1, alpha: look.mika, halo: look.halo },
    ...(["ernie", "kenn", "bea"] as const).map((id) => {
      const km = id === "bea" ? 8 : 2;
      return { world: CAST_WORLD[id], size: 11, tint: 0 as const, alpha: Math.min(1, look.crew + lift(km)), halo: lift(km) * 0.5 };
    }),
  ];
  if (look.roster > 0.01)
    for (const n of NEIGHBOURS) {
      if (n.erased && look.erased) continue;
      stars.push({ world: n.world, size: 8.5, tint: 0, alpha: Math.min(1, look.roster * (n.km <= 25 ? 0.62 : 0.4) + lift(n.km)) });
    }
  return stars;
}

/** The erased coordinator's star (storyboard Ch2: 3 km out, never named). */
export const COORDINATOR = ROSTER_WORLD.find((n) => n.erased)!;

/** A radar ring around Mika on the plane at her stars' height. */
export const radarRing = (km: number, progress: number, alpha: number, width = 1.6): Ring => ({
  center: MIKA,
  radius: km / KM_PER_UNIT,
  progress,
  alpha,
  width,
});

/** The radar framing (S4): looking down at about 52° across Cebu City, Mika a little above centre. */
export const radarRig = (distance: number, heading = 18): Rig => ({ target: MIKA, distance, pitch: 54, heading, fov: 40, shift: [0, -0.125] });

/** An application's thread, from a crew member's star toward Mika's. */
export const thread = (who: "ernie" | "kenn" | "bea", progress: number, alpha: number, width = 1.6): Thread => ({
  a: CAST_WORLD[who],
  b: MIKA,
  progress,
  alpha,
  width,
});

/** Where Virgo sits on the reel's frame in S5 and the end card: the band under the caption. */
export const VIRGO_RECT = [0.05, 0.27, 0.95, 0.74] as const;
/** The end card's band: under the logo, over the headline. */
export const END_RECT = [0.04, 0.25, 0.96, 0.49] as const;

export const earthFor = (rect: readonly [number, number, number, number], margin = 0.06) =>
  earthRig(SKY_CSS.width, SKY_CSS.height, { rect, margin });

/** Off to the side, where the 14 stars are a scatter (scenes.ts offAxisRig, portrait: wider and further off). */
export const sideFor = (rect: readonly [number, number, number, number]) =>
  offAxisRig({ heading: 40, pitch: -12, distance: 430, fov: 60, shift: earthFor(rect).shift });

/** The figure from Earth, with the four cast stars gliding up from the map at `morph`. */
export function virgo(o: {
  camera: Rig;
  opacity: number;
  stars: number;
  form: number;
  syrma: number;
  cast: number;
  crew: number;
  field: number;
  morph?: number;
}): DeepState {
  return {
    camera: rig(o.camera),
    opacity: o.opacity,
    stars: o.stars,
    form: o.form,
    syrma: o.syrma,
    cast: o.cast,
    crew: o.crew,
    field: o.field,
    morph:
      o.morph === undefined
        ? undefined
        : {
            t: o.morph,
            from: {
              [CAST_STARS.mika]: CAST_WORLD.mika,
              [CAST_STARS.ernie]: CAST_WORLD.ernie,
              [CAST_STARS.kenn]: CAST_WORLD.kenn,
              [CAST_STARS.bea]: CAST_WORLD.bea,
            },
          },
  };
}

export { mixRig, rig };
export type { GeoState };
