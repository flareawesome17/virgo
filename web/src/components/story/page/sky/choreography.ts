/**
 * The page's three sky scenes (copied from the sky lab, which keeps its own) as functions of scroll progress: the Prologue
 * descent, Ch3's "from where you stand", and Ch8's crane up. Each returns a
 * fresh SkyFrame; the engine draws whatever it is handed.
 *
 * A prototype of the Phase 4 choreography, timed to the storyboard's
 * p-tables, so the numbers here are the ones to start from.
 *
 * Stars are people (the Prologue's "Every star is a creative."): the cast
 * carry diffraction spikes and breathe wherever the sky shows them, the
 * roster and the cloud's city stars draw in a warmer cream than the field,
 * Ch3's Virgo forms with sparks and a pulse of light, and in Ch8 Mika's crew
 * hangs over Cebu City as Virgo among the other crews' figures.
 */
import { CITIES } from '@/components/story/data/cities.generated';
import { CAST_STARS, type StarId } from '@/components/story/data/constellation';
import { STAR_ROLES } from '@/components/story/data/strings/page-prologue';
import { aim, rig, rigAt, smoothstep, span, view, type Rect, type Rig, type RigKey, type Vec3 } from '@/components/story/sky/camera';
import { CLUSTERS } from '@/components/story/sky/clusters.generated';
import { CAST_WORLD, HOME_GROUND, ROSTER_WORLD, earthRig, offAxisRig } from '@/components/story/sky/scenes';
import { toWorld, type Cluster } from '@/components/story/sky/sky-seed';
import type { DeepState, GeoFigure, GeoState, LabelState, SkyFrame, StoryStar, Thread } from '@/components/story/sky/types';

export type Layout = { w: number; h: number; mobile: boolean };

const MIKA = CAST_WORLD.mika;
/** The map frame's centre, and the Visayas, on the ground. */
const ARCHIPELAGO: Vec3 = [296, 0, -520];
const VISAYAS: Vec3 = [404, 0, -640];

/** Where the Prologue lands, and Ch3 and Ch8 start: just south-west of Mika, looking north-north-east across Cebu City. */
const LANDED: Rig = { target: MIKA, distance: 15, pitch: 46, heading: 22, fov: 42 };

/** Distance at which a fov frames `units` of ground across the viewport's narrower fit, looking straight down. */
function frameDistance(widthUnits: number, heightUnits: number, l: Layout, fov: number, margin = 1.08): number {
  const t = Math.tan((fov * Math.PI) / 360);
  return Math.max(heightUnits / (2 * t), widthUnits / (2 * t * (l.w / l.h))) * margin;
}

function prologueKeys(l: Layout): RigKey[] {
  if (l.mobile) {
    // Phones: the archipelago fills the portrait frame at load (storyboard Prologue, Mobile),
    // then the push starts from a Visayas framing.
    return [
      { at: 0.16, rig: { target: ARCHIPELAGO, distance: frameDistance(591.6, 1000, l, 60, 1.04), pitch: 89, heading: 0, fov: 60 } },
      { at: 0.45, rig: { target: VISAYAS, distance: frameDistance(270, 250, l, 56), pitch: 84, heading: 4, fov: 56 } },
      { at: 0.8, rig: { target: [MIKA[0], 0.4, MIKA[2]], distance: 30, pitch: 56, heading: 16, fov: 46 } },
      { at: 1, rig: { ...LANDED, distance: 17, fov: 46 } },
    ];
  }
  // Desktop: the archipelago right of centre (a lens shift), clear of the hero copy on the left.
  return [
    { at: 0.16, rig: { target: ARCHIPELAGO, distance: frameDistance(591.6, 1000, l, 56, 1.12), pitch: 88, heading: 0, fov: 56, shift: [0.2, 0] } },
    { at: 0.45, rig: { target: VISAYAS, distance: 430, pitch: 80, heading: 6, fov: 52, shift: [0.04, 0] } },
    { at: 0.8, rig: { target: [MIKA[0], 0.4, MIKA[2]], distance: 34, pitch: 56, heading: 16, fov: 44 } },
    { at: 1, rig: LANDED },
  ];
}

const CAST_ORDER = ['mika', 'ernie', 'kenn', 'bea'] as const;
/** The rest of the roster: Ch2's people, already there as faint stars before anyone searches. */
const NEIGHBOURS = ROSTER_WORLD.filter((n) => !['Ernie', 'Kenn', 'Bea'].includes(n.name));

/**
 * Mika, the crew, and (at `roster` > 0) the neighbours, as story stars.
 * Every one of them is a person, so they draw in the people's warm cream;
 * `featured` sets Mika's spikes and the crew's (at 60% of hers).
 */
function castStars(mikaHalo: number, alpha: number, others: number, roster = 0, featured = 0): StoryStar[] {
  const stars: StoryStar[] = CAST_ORDER.map((id) =>
    id === 'mika'
      ? { world: MIKA, size: 15, tint: 1, alpha, halo: mikaHalo, featured }
      : { world: CAST_WORLD[id], size: 11, tint: 2, alpha: alpha * others, featured: featured * 0.6 },
  );
  if (roster > 0.01) for (const n of NEIGHBOURS) stars.push({ world: n.world, size: 8.5, tint: 2, alpha: roster * (n.km <= 25 ? 0.62 : 0.4), halo: 0.18 * roster });
  return stars;
}

/** Where each of the Prologue's role tags stands: its city, on the ground. */
const ROLE_WORLD: readonly Vec3[] = STAR_ROLES.map(({ city }) => {
  const c = CITIES.find((x) => x.name === city)!;
  return toWorld(c.x, c.y);
});

/**
 * "Every star is a creative.": the tags come up one after another as the
 * line plays (p 0.3–0.58), and go before the camera reaches Cebu. Phones
 * show the first four.
 */
function roleLabels(p: number, l: Layout): LabelState[] {
  const n = l.mobile ? 4 : ROLE_WORLD.length;
  const out = 1 - smoothstep(0.54, 0.6, p);
  return ROLE_WORLD.slice(0, n).map((world, i) => ({ id: `role-${i}`, world, scene: 'geo', opacity: smoothstep(0.3 + i * 0.025, 0.34 + i * 0.025, p) * out }));
}

/** (a) Prologue: from deep space, down through the stars, onto Mika. */
export function prologue(p: number, l: Layout): SkyFrame {
  const camera = rig(rigAt(prologueKeys(l), p));
  const arrive = smoothstep(0.62, 0.9, p);
  const geo: GeoState = {
    camera,
    opacity: 1,
    // The whole coastline is saved for Ch8's reveal; only the Visayas' coasts come up as the camera arrives.
    map: 0.075 * smoothstep(0.5, 0.76, p),
    dimOuter: { center: MIKA, radius: 26, amount: smoothstep(0.45, 0.8, p) },
    // "Every star is a creative": the cast's spikes come up as the camera arrives, Mika's as it lands on her.
    stars: castStars(smoothstep(0.8, 0.97, p), arrive, 0.75, smoothstep(0.7, 0.95, p), smoothstep(0.7, 0.95, p)),
    motes: smoothstep(0.17, 0.3, p) * (1 - smoothstep(0.8, 0.96, p)),
  };
  return {
    geo,
    // Mika's card opens out of her star as the camera lands (page/sky/mika-card.tsx runs its unfolding).
    labels: [...roleLabels(p, l), { id: 'mika-card', world: MIKA, scene: 'geo', opacity: smoothstep(0.83, 0.85, p) }],
    // The desktop film covers the sky until it fades (p ≈ 0.3): no shooting star behind it.
    space: { meteors: l.mobile || p > 0.3 },
  };
}

const CAST_IDS: { who: (typeof CAST_ORDER)[number]; star: StarId }[] = CAST_ORDER.map((who) => ({ who, star: CAST_STARS[who] }));

/** Where Virgo sits on screen in Ch3: above the caption on desktop, the top half on phones (a bottom sheet comes up below). */
export function virgoRect(l: Layout): Rect {
  return l.mobile ? [0.03, 0.06, 0.97, 0.5] : [0.06, 0.07, 0.94, 0.74];
}

/**
 * Ch3's beats on the sky clock `q` (ch3-scene.tsx maps the take onto it:
 * q 0.5 → 0.95 over the take's p 0.62 → 0.96). The figure forms as Ernie's
 * terms card goes back into the sky (it is gone by q ≈ 0.73), completes with
 * a pulse of light, then holds, glowing, to the end of the chapter: about a
 * sixth of the take, up from a few per cent, so it is there to be seen.
 */
export const CONNECT_SKY = {
  /** The edges start drawing, each from its first star, with a spark at the tip. */
  form: [0.66, 0.86],
  /** The cast's gold halos. */
  cast: [0.68, 0.84],
  /** The pulse when it completes, and the steady glow after. */
  pulse: [0.85, 0.89, 0.91, 0.98],
  glow: [0.82, 0.9],
  /** The cast's names (desktop). */
  labels: 0.86,
} as const;

/** (b) Ch3: applications travel in, Mika looks up, and from Earth the cast become Virgo. */
export function connect(q: number, l: Layout): SkyFrame {
  // On the ground: a small pull back while the threads arrive, then the camera tilts up into the sky.
  const pulled = rigAt([{ at: 0, rig: LANDED }, { at: 0.1, rig: { ...LANDED, distance: 19, pitch: 40, heading: 24 } }], q);
  const standing = rig(pulled).position;
  const look = span(q, 0.1, 0.32);
  const ease = look * look * (3 - 2 * look);
  const camera = q < 0.1 ? rig(pulled) : aim(standing, 40 + (-34 - 40) * ease, 24 - 12 * ease, 42, 40);
  const geoFade = 1 - smoothstep(0.12, 0.27, q);
  const threads: Thread[] = (['ernie', 'kenn', 'bea'] as const).map((who, i) => {
    const t = span(q, 0.005 + i * 0.022, 0.07 + i * 0.022);
    return { a: CAST_WORLD[who], b: MIKA, progress: t, alpha: 0.35 + 0.55 * smoothstep(0.06 + i * 0.02, 0.1 + i * 0.02, q), width: 1.4 };
  });
  const geo: GeoState = {
    camera,
    opacity: geoFade,
    map: 0.075 * (1 - smoothstep(0.1, 0.2, q)),
    dimOuter: { center: MIKA, radius: 26, amount: 1 - smoothstep(0.08, 0.2, q) },
    // The crew's stars light (spikes) as each thread lands on Mika.
    stars: castStars(1 - smoothstep(0.05, 0.15, q), 1, 0.85, 1 - smoothstep(0.02, 0.12, q), 0.6 + 0.4 * smoothstep(0.04, 0.12, q)),
    threads,
  };
  const earth = earthRig(l.w, l.h, { rect: virgoRect(l), margin: l.mobile ? 0.05 : 0.08 });
  // A portrait screen sees a narrow slice sideways, so phones stand further off with a wider lens.
  const side = l.mobile ? offAxisRig({ heading: 70, pitch: -12, distance: 520, fov: 74, shift: earth.shift }) : offAxisRig({ shift: earth.shift });
  const [f0, f1] = CONNECT_SKY.form;
  const [p0, p1, p2, p3] = CONNECT_SKY.pulse;
  const pulse = smoothstep(p0, p1, q) * (1 - smoothstep(p2, p3, q));
  const glow = smoothstep(CONNECT_SKY.glow[0], CONNECT_SKY.glow[1], q);
  const deep: DeepState = {
    camera: rig(rigAt([{ at: 0.15, rig: side }, { at: 0.82, rig: earth }], q)),
    opacity: smoothstep(0.1, 0.2, q),
    stars: smoothstep(0.1, 0.22, q),
    form: span(q, f0, f1),
    syrma: 0,
    cast: smoothstep(CONNECT_SKY.cast[0], CONNECT_SKY.cast[1], q),
    crew: 1 - smoothstep(f0, f1 - 0.02, q),
    // The far field steps back a little while the figure forms, so the figure is what reads.
    field: smoothstep(0.08, 0.22, q) * (1 - 0.3 * smoothstep(f0, f1, q)),
    // The cast are people from the moment they leave the map.
    featured: smoothstep(0.1, 0.2, q),
    glow,
    pulse,
    morph: {
      t: span(q, 0.12, 0.38),
      from: Object.fromEntries(CAST_IDS.map(({ who, star }) => [star, CAST_WORLD[who]])),
    },
  };
  // Phones name the cast in one caption line instead (storyboard Ch3, the crowded fallback).
  const labels: LabelState[] = l.mobile
    ? []
    : CAST_IDS.map(({ star }, i) => ({
        id: `cast-${star}`,
        star,
        scene: 'deep',
        opacity: smoothstep(CONNECT_SKY.labels + i * 0.015, CONNECT_SKY.labels + 0.06 + i * 0.015, q),
      }));
  // Deep space steps back with the field while Virgo forms, and no shooting star crosses it.
  const space = { opacity: 1 - 0.3 * smoothstep(f0, f1, q), meteors: q < 0.5 };
  return { geo, deep, labels, space };
}

/** Ch8's cities with a desktop label: a few, spread north to south. */
export const CITY_LABELS = ['Baguio', 'Iloilo City', 'Tacloban', 'Cagayan de Oro', 'Davao City'] as const;

const centroid = (c: Cluster): Vec3 => {
  const n = c.stars.length;
  return c.stars.reduce<Vec3>((m, s) => [m[0] + s[0] / n, m[1] + s[1] / n, m[2] + s[2] / n], [0, 0, 0]);
};

/** The clusters a layout draws: 12 on phones, 18 on desktop. */
export const clustersFor = (l: Layout) => (l.mobile ? CLUSTERS.mobile : CLUSTERS.desktop);

/** The crane's last framing: the archipelago as a plane in perspective, Mindanao near and large, Luzon receding. */
const craneEnd = (l: Layout): Rig =>
  l.mobile ? { target: [300, 0, -556], distance: 1260, pitch: 52, heading: 0, fov: 58 } : { target: [318, 0, -560], distance: 830, pitch: 35, heading: -6, fov: 50 };

/**
 * Mika's crew over Cebu City, as Virgo (Ch8, "a crew like this one"): the
 * figure Ch3 formed, hovering 34 units (about 64 km) up like the other
 * crews' figures over theirs, about 90 km across, in a plane facing the
 * crane's last framing so it reads true there. The crane rises past it: it
 * comes down into frame large as the camera climbs, then settles among the
 * crews, one of the many.
 */
function cebuFigure(l: Layout): Omit<GeoFigure, 'opacity'> {
  const v = view(rig(craneEnd(l)), 1, 1);
  return {
    center: [HOME_GROUND[0], 34, HOME_GROUND[2]],
    right: [v.rx, v.ry, v.rz],
    up: [v.ux, v.uy, v.uz],
    scale: 58,
    ground: HOME_GROUND,
  };
}
const FIGURES = { mobile: cebuFigure({ w: 390, h: 844, mobile: true }), desktop: cebuFigure({ w: 1440, h: 900, mobile: false }) };

/** (c) Ch8: the crane up from Cebu City; small constellations hover over their cities. */
export function crane(r: number, l: Layout, fromDeep: boolean): SkyFrame {
  const end = craneEnd(l);
  const camera = rig(rigAt([{ at: 0.06, rig: l.mobile ? { ...LANDED, distance: 17, fov: 46 } : LANDED }, { at: 0.56, rig: end }], r));
  const list = clustersFor(l);
  const geo: GeoState = {
    camera,
    opacity: fromDeep ? smoothstep(0, 0.08, r) : 1,
    // "The coastline appears under the stars at 14%."
    map: 0.14 * smoothstep(0.16, 0.45, r),
    stars: castStars(0.6 * (1 - smoothstep(0.1, 0.3, r)), 1 - smoothstep(0.3, 0.5, r) * 0.6, 0.8, 1 - smoothstep(0.08, 0.3, r), 1 - smoothstep(0.18, 0.4, r)),
    clusters: { wave: span(r, 0.3, 0.7), list },
    // Large as the crane climbs past it (r ≈ 0.28–0.36), then half strength once the other crews light: one of many,
    // and quieter beside Iloilo's glyph, which ends up just up and left of it.
    figure: { ...FIGURES[l.mobile ? 'mobile' : 'desktop'], opacity: smoothstep(0.1, 0.22, r) * (1 - 0.5 * smoothstep(0.5, 0.75, r)) },
    motes: smoothstep(0.05, 0.12, r) * (1 - smoothstep(0.42, 0.56, r)),
  };
  const labels: LabelState[] = l.mobile
    ? []
    : CITY_LABELS.map((name) => {
        const c = list.find((k) => k.city === name)!;
        return {
          id: `city-${name}`,
          world: centroid(c),
          scene: 'geo',
          opacity: smoothstep(0.42 + c.wave * 0.28, 0.5 + c.wave * 0.28, r) * (1 - smoothstep(0.9, 1, r) * 0.5),
        };
      });
  labels.push({ id: 'bea-tag', world: CAST_WORLD.bea, scene: 'geo', opacity: smoothstep(0.82, 0.92, r) });
  const deep: DeepState | undefined = fromDeep
    ? {
        camera: rig(earthRig(l.w, l.h, { rect: virgoRect(l), margin: l.mobile ? 0.05 : 0.08 })),
        opacity: 1 - smoothstep(0, 0.07, r),
        stars: 1,
        form: 1,
        syrma: 0,
        cast: 1,
        field: 1,
        featured: 1,
        glow: 1,
      }
    : undefined;
  return { geo, deep, labels };
}

/** The lab's whole timeline: whichever demo's track is in play. */
export function labFrame(p1: number, p2: number, p3: number, l: Layout): SkyFrame {
  if (p3 > 0) return crane(p3, l, p2 >= 1);
  if (p2 > 0) return connect(p2, l);
  return prologue(p1, l);
}
