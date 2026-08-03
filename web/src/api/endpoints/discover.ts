import { api } from '../client';

export interface NearbyPerson {
  id: string;
  name: string;
  avatarUrl: string | null;
  /** Kilometres. The API never returns anyone else's coordinates. */
  distanceKm: number;
  relationship: 'none' | 'pending_out' | 'pending_in' | 'accepted';
  /**
   * What they do on a shoot.
   *
   * Optional because a response cached by a client running against an older
   * API has no such field, and typing it as always-present is what let a
   * `.length` on it crash the Nearby screen. Read it as `roles ?? []`.
   */
  roles?: string[];
  /**
   * Their public profile address, when they have published one.
   *
   * Null for everyone else, which is what decides whether a "View profile"
   * link is offered at all — a handle without a published profile 404s.
   */
  handle?: string | null;
}

export interface LocationStatus {
  sharing: boolean;
  updatedAt: string | null;
}

/**
 * Nearby collaborator discovery.
 *
 * Sharing is opt-in and reciprocal: only people who share are discoverable, and
 * only someone sharing their own location can search.
 */
export const discoverApi = {
  locationStatus(): Promise<LocationStatus> {
    return api.get('/discover/location');
  },

  /** Stores the position and turns sharing on. */
  shareLocation(latitude: number, longitude: number): Promise<{ sharing: boolean }> {
    return api.post('/discover/location', { body: { latitude, longitude } });
  },

  /** Turns sharing off and erases the stored position. */
  stopSharing(): Promise<{ sharing: boolean }> {
    return api.delete('/discover/location');
  },

  /**
   * People nearby, optionally only those who do a particular job.
   *
   * `roles` is sent comma-separated; the API accepts that and the repeated
   * form, and matches on overlap — somebody who is both a photographer and an
   * editor turns up under either.
   */
  nearby(
    radiusKm = 50,
    roles: string[] = [],
  ): Promise<{ sharing: boolean; people: NearbyPerson[] }> {
    return api.get('/discover/nearby', {
      query: {
        radiusKm,
        ...(roles.length > 0 ? { roles: roles.join(',') } : {}),
      },
    });
  },

  /**
   * How many people nearby do each role.
   *
   * Unaffected by the current filter on purpose — these are the counts you
   * choose from, so they must not collapse to zero once a chip is picked.
   */
  nearbyRoleCounts(radiusKm = 50): Promise<Record<string, number>> {
    return api.get('/discover/nearby/roles', { query: { radiusKm } });
  },
};
