/**
 * Handles — the `@mika` in virgo.ph/@mika.
 *
 * The whole public address of a person, so the rules are deliberately narrow:
 * anything ambiguous, unpronounceable or confusable is worth refusing once at
 * the point of claiming rather than living with forever.
 */

/**
 * Lowercase, starts with a letter, 3–30 characters.
 *
 * No dots, and that is not cosmetic: the web proxy's matcher skips any path
 * containing one (see web/src/proxy.ts), so `virgo.ph/@ana.cruz` would never
 * reach the page at all. No hyphens either — they are too easily confused with
 * underscores when somebody reads a handle off a business card.
 */
export const HANDLE_PATTERN = /^[a-z][a-z0-9_]{2,29}$/;

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 30;

/**
 * Handles nobody may claim.
 *
 * Two kinds, kept in one list because the answer to the user is the same:
 *
 *   - Paths the site already serves, or plausibly will. A handle that collides
 *     with a real route is a page somebody cannot reach.
 *   - Words that would let an account pass itself off as Virgo itself.
 *
 * Checked against the *lowercased* handle, which is the only form stored.
 */
export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
  // Infrastructure and existing routes.
  'api', 'app', 'www', 'cdn', 'mail', 'ftp', 'ws', 'static', 'assets',
  's', 'p', 'u', 'me', 'new', 'edit', 'search', 'explore',
  'sign_in', 'signin', 'sign_up', 'signup', 'login', 'logout', 'register',
  'settings', 'profile', 'profiles', 'account', 'accounts',
  'landing', 'home', 'index', 'dashboard',
  'chat', 'messages', 'schedule', 'calendar', 'nearby', 'network',
  'workspaces', 'albums', 'media', 'storage', 'billing', 'plans', 'pricing',
  'health', 'status', 'legal', 'terms', 'privacy', 'about', 'help', 'support',
  'contact', 'blog', 'docs', 'download', 'hire', 'jobs', 'careers',
  // Identity.
  'virgo', 'virgoph', 'virgo_ph', 'official', 'staff', 'team', 'admin',
  'administrator', 'root', 'system', 'moderator', 'mod', 'security',
  'noreply', 'no_reply', 'postmaster', 'webmaster', 'null', 'undefined',
]);

export type HandleProblem =
  | 'too_short'
  | 'too_long'
  | 'bad_characters'
  | 'reserved';

/** Why a handle cannot be used, or null if it can. */
export function handleProblem(raw: string): HandleProblem | null {
  const handle = raw.trim().toLowerCase();

  if (handle.length < HANDLE_MIN) return 'too_short';
  if (handle.length > HANDLE_MAX) return 'too_long';
  if (!HANDLE_PATTERN.test(handle)) return 'bad_characters';
  if (RESERVED_HANDLES.has(handle)) return 'reserved';
  return null;
}

/** A sentence to show the person, rather than an enum. */
export function handleProblemMessage(problem: HandleProblem): string {
  switch (problem) {
    case 'too_short':
      return `Handles are at least ${HANDLE_MIN} characters.`;
    case 'too_long':
      return `Handles are at most ${HANDLE_MAX} characters.`;
    case 'bad_characters':
      return 'Use letters, numbers and underscores, starting with a letter.';
    case 'reserved':
      return 'That one is reserved. Try another.';
  }
}

/** The only form ever stored or compared. */
export function normalizeHandle(raw: string): string {
  return raw.trim().toLowerCase();
}

/** How long somebody must wait before changing it again. */
export const HANDLE_CHANGE_COOLDOWN_DAYS = 30;
