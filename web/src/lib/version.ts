/**
 * Which release this build is.
 *
 * Set by the release workflow from the GitHub tag it checked out, passed to
 * `docker build` as `APP_VERSION`, and inlined here at build time like every
 * other `NEXT_PUBLIC_` value. That means the number cannot disagree with the
 * code around it: the workflow checks out the tag, builds, and stamps the
 * image in one step.
 *
 * It also means the *right* thing is displayed. Asking GitHub for "the latest
 * release" at runtime would report a version that may not be deployed yet — an
 * app announcing v1.1.0 while serving v1.0.0 is worse than one that says
 * nothing at all.
 *
 * `||` and not `??`, deliberately. An `ARG` the build was never given becomes
 * an empty string rather than undefined, and `??` does not fall back on `''` —
 * that exact mistake once shipped `new URL('')` into this app's build and
 * broke it everywhere.
 */
export const APP_VERSION = (process.env.NEXT_PUBLIC_APP_VERSION || '').trim() || null;

/** Short SHA of the commit the release was cut from, when the build supplied one. */
export const APP_COMMIT =
  (process.env.NEXT_PUBLIC_APP_COMMIT || '').trim().slice(0, 7) || null;

/**
 * The version the desktop bundle was staged with.
 *
 * `desktop/scripts/stage-web.mjs` reads it out of tauri.conf.json, which the
 * release workflow stamps from the tag, so it is by construction the number the
 * installer carries. It is the only version the desktop app can state: that
 * bundle is built by the desktop job, not by `docker build`, so APP_VERSION
 * above is empty there — which is why the app showed no version at all.
 */
export const DESKTOP_VERSION =
  (process.env.NEXT_PUBLIC_DESKTOP_VERSION || '').trim() || null;

/**
 * What this build calls itself, whichever way it is running.
 *
 * The desktop number is prefixed so the two read alike: the image is stamped
 * with the tag (`v1.12.0`) and tauri.conf.json carries the bare version
 * (`1.12.0`). Null on a local build of either, which is deliberate — a local
 * build is not a release, and labelling it with one would be a small lie told
 * on every screen.
 */
export const RELEASE_LABEL =
  APP_VERSION ?? (DESKTOP_VERSION ? `v${DESKTOP_VERSION}` : null);
