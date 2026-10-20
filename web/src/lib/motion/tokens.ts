/**
 * Motion tokens. Pure, no imports (tests load it directly).
 * Values mirror the CSS variables in globals.css; change both together.
 */
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** A spring with about 10% overshoot, sampled as a CSS linear() easing. */
export const SPRING_LINEAR =
  'linear(0, 0.009, 0.035 2.1%, 0.141 4.4%, 0.723 12.9%, 0.938 16.7%, 1.017 19.4%, 1.067, 1.099 24.3%, 1.108 26%, 1.104, 1.085 31.5%, 1.019 38.3%, 0.999 42.3%, 0.989 46.1%, 0.993 55.5%, 1.001 69%, 1)';
/** For engines without linear() easing. */
export const SPRING_FALLBACK = 'cubic-bezier(0.34, 1.56, 0.64, 1)';

export const MOTION = {
  duration: { fast: 120, base: 200, slow: 320, genieOpen: 420, genieClose: 340 },
  ease: {
    inOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
    out: 'cubic-bezier(0.22, 1, 0.36, 1)',
    in: 'cubic-bezier(0.55, 0, 1, 0.45)',
    spring: SPRING_LINEAR,
  },
  magnify: { hover: 1.12, press: 0.94 },
} as const;
