import { api } from '../client';

/**
 * What the public page shows.
 *
 * Mirrors PublicProfile on the server, which is an explicit allow-list rather
 * than a user row — so this type is the whole contract, not a subset of one.
 */
export interface PublicProfile {
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  title: string | null;
  bio: string | null;
  /** The free-text city they typed. Never coordinates. */
  location: string | null;
  website: string | null;
  roles: string[];
  /** Year only. */
  memberSince: number;
}

export interface ProfileSettings {
  handle: string | null;
  handleChangedAt: string | null;
  published: boolean;
  canPublish: boolean;
  /** Plain sentences naming what is still missing. */
  blockers: string[];
}

/**
 * Public profiles and the controls behind them.
 *
 * `publicProfile` is the only method here that works without a token — the
 * page that uses it is rendered on the server, where there is no session
 * anyway.
 */
export const profilesApi = {
  /** A published profile by handle. 404 when missing, private, or paused. */
  publicProfile(handle: string): Promise<PublicProfile> {
    return api.get<PublicProfile>(`/profiles/${encodeURIComponent(handle)}`, {
      anonymous: true,
    });
  },

  /** The caller's own handle and publish state, for the editor. */
  settings(): Promise<ProfileSettings> {
    return api.get<ProfileSettings>('/me/profile');
  },

  checkHandle(handle: string): Promise<{ available: boolean; reason: string | null }> {
    return api.get('/me/profile/handle-available', { query: { handle } });
  },

  setHandle(handle: string): Promise<{ handle: string }> {
    return api.patch('/me/profile/handle', { body: { handle } });
  },

  setPublished(published: boolean): Promise<{ published: boolean; handle: string | null }> {
    return api.patch('/me/profile/publish', { body: { published } });
  },
};

/** The public address of a profile, for sharing and for canonical tags. */
export function profileUrl(handle: string, origin = 'https://virgo.ph'): string {
  return `${origin}/@${handle}`;
}
