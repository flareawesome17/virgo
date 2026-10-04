/**
 * What the sky draws on one frame. A chapter's choreography builds a
 * `SkyFrame` from its scroll progress; the engine draws it, places the map
 * and the labels from it, and draws nothing until the next one arrives.
 * Build a new object whenever anything changes: the engine compares by
 * identity.
 */
import type { StarId } from '../data/constellation';
import type { Camera, Vec3 } from './camera';
import type { Cluster } from './sky-seed';

/** A named star placed by the story (the cast, the roster, a file joining the sky). */
export type StoryStar = {
  readonly world: Vec3;
  /** Width drawn at the target's distance, CSS px, falloff included. */
  readonly size: number;
  /** 0 warm white, 1 gold, 2 warm cream (a person's star in the cloud). */
  readonly tint?: 0 | 1 | 2;
  readonly alpha: number;
  /** 0..1: a soft halo around it. */
  readonly halo?: number;
  /**
   * 0..1: a person's star, set apart from the field: a hotter core, a soft
   * halo and fine four-point diffraction spikes, breathing slowly (the
   * breath stops under Pause). The cast carry it wherever the sky shows them.
   */
  readonly featured?: number;
};

/**
 * Virgo drawn in the geo scene, in a plane facing a chosen camera: Ch8's
 * "a crew like this one", Mika's crew hovering over Cebu City the way the
 * other crews' small figures hover over theirs, with a thread down to it.
 * Star `s` sits at `center + scale · (s.gx · right − s.gy · up)`.
 */
export type GeoFigure = {
  readonly center: Vec3;
  readonly right: Vec3;
  readonly up: Vec3;
  /** World units per tangent unit (the figure is 0.83 tangent units wide). */
  readonly scale: number;
  readonly opacity: number;
  /** Where its thread of light comes down. */
  readonly ground?: Vec3;
};

/**
 * Deep space behind both scenes (space.ts): the far star field, the Milky
 * Way, the nebulae and the shooting stars. It turns with whichever scene's
 * camera is in play, slower than the stars in front of it.
 */
export type SpaceState = {
  /** 0..1, default 1. */
  readonly opacity?: number;
  /** Whether a shooting star may start now (default true). Off where the frame has a figure to read. */
  readonly meteors?: boolean;
};

/** A ring on (or parallel to) the map plane, drawn in perspective: the radar. */
export type Ring = {
  readonly center: Vec3;
  /** World units. */
  readonly radius: number;
  /** How much of the circle is drawn, from north, clockwise. Default 1. */
  readonly progress?: number;
  readonly alpha: number;
  /** CSS px. */
  readonly width?: number;
  readonly color?: string;
};

/** A thread of light between two world points, drawn from `a` toward `b`. */
export type Thread = {
  readonly a: Vec3;
  readonly b: Vec3;
  /** How far from a to b. Default 1. */
  readonly progress?: number;
  readonly alpha: number;
  readonly width?: number;
  readonly color?: string;
};

/** The geo scene: the map plane and the seeded star cloud above it, in map units. */
export type GeoState = {
  readonly camera: Camera;
  readonly opacity: number;
  /** The map layers' opacity, 0..1 (absent: hidden). */
  readonly map?: number;
  /** The seeded cloud's opacity, 0..1. Default 1. */
  readonly cloud?: number;
  /** Stars farther than `radius` (horizontally) from `center` dim by up to 85% (Prologue: outer stars to 15%). */
  readonly dimOuter?: { readonly center: Vec3; readonly radius: number; readonly amount: number };
  readonly stars?: readonly StoryStar[];
  readonly rings?: readonly Ring[];
  readonly threads?: readonly Thread[];
  /**
   * Ch8's small constellations (clusters.generated.ts, the variant's list)
   * and how far their north-to-south wave has run, 0..1. Absent: none drawn.
   */
  readonly clusters?: { readonly wave: number; readonly list: readonly Cluster[] };
  /**
   * 0..1: near-field dust that streams past during big camera moves, so a
   * dolly reads as travel through depth (§1.13). Absent or 0: none.
   */
  readonly motes?: number;
  /** Virgo over a place on the map (Ch8). Absent: none. */
  readonly figure?: GeoFigure;
};

/** The deep-sky scene: Virgo's 14 stars at their real distances, Earth at the origin, in light-years. */
export type DeepState = {
  readonly camera: Camera;
  readonly opacity: number;
  /** 0..1: the figure's stars fade in. */
  readonly stars: number;
  /** 0..1: the 12 segments draw, each growing from its first star, in turn. */
  readonly form: number;
  /** 0..1: Syrma ignites and its two segments draw. Below 1 it is a hollow socket. */
  readonly syrma: number;
  /** 0..1: the cast's four stars carry a gold halo. */
  readonly cast?: number;
  /**
   * 0..1: the crew's threads (Ernie, Kenn and Bea to Mika) carried up from
   * the map. They fade as the figure's own edges draw, so the sky ends up
   * astronomically honest.
   */
  readonly crew?: number;
  /** 0..1: the far background field. Default 1. */
  readonly field?: number;
  /** 0..1: the cast's stars carry spikes and breathe (they are people). Default 0. */
  readonly featured?: number;
  /**
   * 0..1: the figure, once formed, glows: brighter lines with a soft bloom
   * under them, and a light at every star. Default 0.
   */
  readonly glow?: number;
  /** 0..1..0: the moment the figure completes, a pulse of light along it. Default 0. */
  readonly pulse?: number;
  /**
   * The cast's stars glide from where they stood on the map (geo world
   * points, seen by the geo camera) to their places in the figure: 0 on
   * the map, 1 in the sky.
   */
  readonly morph?: { readonly t: number; readonly from: Partial<Record<StarId, Vec3>> };
};

/**
 * An HTML label (`[data-sky-label="id"]` inside the stage), pinned to a
 * world point, or to one of Virgo's stars (following it through a morph).
 * Only its translate and opacity change, so text never scales.
 */
export type LabelState = {
  readonly id: string;
  readonly world?: Vec3;
  readonly star?: StarId;
  readonly scene: 'geo' | 'deep';
  readonly opacity: number;
};

export type SkyFrame = {
  readonly geo?: GeoState;
  readonly deep?: DeepState;
  readonly labels?: readonly LabelState[];
  /** Deep space behind both scenes. Absent: drawn at full strength, shooting stars allowed. */
  readonly space?: SpaceState;
};

/** Anything with Motion's MotionValue shape, or a plain getter. */
export type FrameSource =
  | { get(): SkyFrame | null; on(event: 'change', callback: (value: SkyFrame | null) => void): () => void }
  | (() => SkyFrame | null);

/** What the engine reports, for the lab overlay and for tuning. */
export type SkyStats = {
  /** The last draw, ms. */
  readonly drawMs: number;
  /** Median and 95th percentile of the last 45 draws, ms. */
  readonly medianMs: number;
  readonly p95Ms: number;
  /** Draws in the last second. */
  readonly fps: number;
  /** drawImage calls in the last frame. */
  readonly sprites: number;
  readonly budget: number;
  readonly stars: number;
  readonly variant: 'desktop' | 'mobile' | 'lite';
  readonly dpr: number;
  readonly width: number;
  readonly height: number;
  /** 0 full, 1 halved without twinkle, 2 frozen to the poster. */
  readonly level: 0 | 1 | 2;
  /** The device's own frame interval, measured, ms. */
  readonly baseMs: number;
  /** Share of slow frames over the last 45 frames of camera motion. */
  readonly slowShare: number;
  readonly running: boolean;
  /** Why the loop is stopped, if it is. */
  readonly idle: string;
  readonly seedHash: string;
  /** Deep space: not wanted or not started, being built, or drawn. */
  readonly space?: 'off' | 'building' | 'on';
  /** Shooting stars so far. */
  readonly meteors?: number;
  /** Whether a chapter is showing the sky. */
  readonly live?: boolean;
};
