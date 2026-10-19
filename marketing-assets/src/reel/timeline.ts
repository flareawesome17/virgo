/**
 * C3, the vertical reel: 840 frames at 30 fps (28.0 s), nine scenes with no
 * overlapping transitions (storyboard §4.1). Each scene owns its frames
 * outright and hands off to the next by matching what is on screen at the
 * cut, so the frame maths is exact: S1 0–75, S2 75–165, … S9 720–840.
 */
export const REEL = { width: 1080, height: 1920, fps: 30, frames: 840 } as const;

export type SceneId = "S1" | "S2" | "S3" | "S4" | "S5" | "S6" | "S7" | "S8" | "S9";

/** [from, to): each scene's frames on the reel's clock. */
export const SCENES: Record<SceneId, { readonly from: number; readonly to: number; readonly mirrors: string }> = {
  S1: { from: 0, to: 75, mirrors: "Prologue" },
  S2: { from: 75, to: 165, mirrors: "Ch1" },
  S3: { from: 165, to: 255, mirrors: "Ch1" },
  S4: { from: 255, to: 345, mirrors: "Ch2" },
  S5: { from: 345, to: 450, mirrors: "Ch3" },
  S6: { from: 450, to: 525, mirrors: "Ch4" },
  S7: { from: 525, to: 630, mirrors: "Ch5" },
  S8: { from: 630, to: 720, mirrors: "Ch6" },
  S9: { from: 720, to: 840, mirrors: "Ch7 + Finale" },
};

/** S9's two parts: Day 91's dissolve (30 frames), then the end card (90 frames, ≥ 3 s). */
export const S9_DISSOLVE = 30;

export const length = (id: SceneId) => SCENES[id].to - SCENES[id].from;

/**
 * Where everything sits on the 1080 × 1920 frame (video-layout rules: 80 px
 * at the sides, 100 px top and bottom; headline ≥ 84 px, support ≥ 44 px).
 * Copy sits in the top band, clear of the platforms' top bar, and nothing
 * that must be read goes below SAFE.copyBottom, where the platforms lay
 * their own caption and buttons.
 */
export const SAFE = {
  side: 80,
  top: 100,
  bottom: 100,
  /** The caption block's top edge. */
  copyTop: 158,
  /** The widest a caption runs: 80 px in from both sides. */
  copyWidth: 920,
  /** Nothing to read below this line. */
  copyBottom: 1500,
} as const;

/** The type scale at 1080 wide. */
export const TYPE = {
  headline: 88,
  /** The floor for any headline (video-layout). */
  headlineMin: 84,
  support: 46,
  /** The floor for supporting text. */
  supportMin: 44,
  eyebrow: 44,
} as const;
