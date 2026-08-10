import posthog from 'posthog-js';

/**
 * Product analytics, for the pre-release.
 *
 * The point of the pre-release is to find out what people actually do, and
 * until now nothing recorded it: somebody could sign up, hit a crash and
 * leave, and we would never know it happened.
 *
 * Everything here is deliberately conservative, because of what this app
 * holds. Virgo has private client galleries, direct messages, real names and
 * rates on screen. Two PostHog defaults would ship all of that to a third
 * party, so both are off:
 *
 *   - `autocapture` records the text of whatever you click. On a chat screen
 *     that is somebody's message; on an album it is a client's name.
 *   - `disable_session_recording` — a recording of this app is a recording of
 *     a photographer's unreleased work.
 *
 * What is left is pageviews, a small set of named events, and an account id.
 * That answers "did anyone post a job" without collecting anything the person
 * would be surprised by.
 */

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

let started = false;

/** Whether analytics is configured at all. Absent key means the whole file no-ops. */
export const analyticsEnabled = !!KEY;

/**
 * Starts PostHog once, in the browser only.
 *
 * Safe to call repeatedly and safe to call with no key — a missing key is the
 * normal state in development, and a build that crashed without one would make
 * analytics a dependency of the app rather than an observer of it.
 */
export function startAnalytics(): void {
  if (started || !KEY || typeof window === 'undefined') return;

  /*
   * Refuse anything that is not a public project key.
   *
   * PostHog's project API key (`phc_`) is meant to be public; its project
   * *secret* key (`phs_`) has scoped read access to the project's data. They
   * differ by one letter and sit two clicks apart in the same settings menu,
   * and this variable is inlined into a bundle every visitor downloads — so
   * the cost of confusing them is publishing a credential, and the check is
   * three lines.
   */
  if (!KEY.startsWith('phc_')) {
    console.error(
      '[analytics] NEXT_PUBLIC_POSTHOG_KEY does not look like a public project key ' +
        '(expected phc_…). Not starting. If this is a project *secret* key, ' +
        'remove it — this value ships to every browser.',
    );
    return;
  }

  started = true;

  posthog.init(KEY, {
    api_host: HOST,
    // Pageviews are sent by hand: the app router changes routes without a
    // document load, so the automatic one fires once and never again.
    capture_pageview: false,
    capture_pageleave: true,
    // See the note above. Neither of these belongs anywhere near this app.
    autocapture: false,
    disable_session_recording: true,
    // A person record only once we know who they are. An anonymous profile
    // for every visitor is a lot of storage to answer nothing.
    person_profiles: 'identified_only',
    // Somebody who has asked not to be tracked has asked us too.
    respect_dnt: true,
  });
}

/** A pageview. Called on every route change, including the first. */
export function trackPageview(url: string): void {
  if (!started) return;
  posthog.capture('$pageview', { $current_url: url });
}

/**
 * The events worth counting.
 *
 * A closed list rather than a free string, so the set stays small enough to
 * read and nobody adds `job_posted_v2` next to `job_posted`. These are the
 * pre-release questions: does anyone finish signing up, does anyone post
 * work, does anyone get hired, does the agreement get used.
 */
export type AnalyticsEvent =
  | 'signed_up'
  | 'signed_in'
  | 'job_posted'
  | 'job_applied'
  | 'application_answered'
  | 'booking_confirmed'
  | 'booking_terms_changed'
  | 'message_sent'
  | 'album_created'
  | 'files_uploaded'
  | 'share_link_created';

/**
 * Records one event.
 *
 * Properties are counts and enums only — never a title, a name, a message or
 * an email. "job_posted with 3 roles" is the useful part; which job it was is
 * not, and it is somebody's business.
 */
export function track(
  event: AnalyticsEvent,
  properties?: Record<string, string | number | boolean | null>,
): void {
  if (!started) return;
  posthog.capture(event, properties);
}

/**
 * Attaches events to an account.
 *
 * The id and nothing else. PostHog will happily hold an email and a name, and
 * there is no question we need answered that is worth putting a user
 * directory in a third-party service to answer.
 */
export function identify(userId: string): void {
  if (!started) return;
  posthog.identify(userId);
}

/** Signing out ends the identity, so the next person on this browser is not them. */
export function resetAnalytics(): void {
  if (!started) return;
  posthog.reset();
}
