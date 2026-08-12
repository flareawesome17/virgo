/**
 * Where the marketing site sends people.
 *
 * The landing page runs on the apex (virgo.ph) and the product on
 * web.virgo.ph, so these have to be absolute — a bare `/sign-in` would resolve
 * against the apex, which the middleware would then bounce, costing a redirect
 * on the most important click on the page.
 *
 * Overridable so a preview deployment can point its buttons at itself instead
 * of at production.
 */
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_ORIGIN || 'https://web.virgo.ph';

export const SIGN_IN_URL = `${APP_URL}/sign-in`;
export const SIGN_UP_URL = `${APP_URL}/sign-up`;
