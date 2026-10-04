/**
 * Seamless-loop arithmetic (storyboard §4, C1): every moving value is a
 * function of the loop's phase θ = 2πf/N built only from integer harmonics,
 * so frame N draws exactly what frame 0 draws and the wrap N−1 → 0 is an
 * ordinary step. The frame is used as it comes, never reduced mod N, so the
 * seam check (frame 288 against frame 0) tests the harmonics themselves.
 */
export const TAU = 6.283185307179586;

/** The loop's phase for a frame: θ = 2πf/N. */
export const phase = (frame: number, loopFrames: number) => (TAU * frame) / loopFrames;

/** A·sin(kθ + φ), with k a whole number of cycles per loop. */
export function harmonic(theta: number, k: number, amplitude: number, offset = 0): number {
  if (!Number.isInteger(k)) throw new Error(`loop: harmonic ${k} is not a whole number of cycles`);
  return amplitude * Math.sin(k * theta + offset);
}

/**
 * Where a repeating life is, 0..1, running k times per loop from offset u0:
 * frac(kθ/2π + u0). It jumps from 1 back to 0, so whatever uses it must be
 * invisible there; `life` is the envelope that guarantees that.
 */
export function cycle(theta: number, k: number, u0: number): number {
  if (!Number.isInteger(k)) throw new Error(`loop: cycle ${k} is not a whole number per loop`);
  const u = (k * theta) / TAU + u0;
  return u - Math.floor(u);
}

/** sin²(πu) = (1 − cos 2πu)/2: zero at both ends of a life, so a wrap never pops (and itself the k-th harmonic). */
export function life(u: number): number {
  const s = Math.sin(Math.PI * u);
  return s * s;
}
