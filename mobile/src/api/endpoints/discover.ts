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
  /**
   * The city this account picked, or null when the position came from the
   * device. Optional so a response from an older API does not read as "GPS".
   */
  place?: string | null;
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

  /** Stores the position from the device and turns sharing on. */
  shareLocation(latitude: number, longitude: number): Promise<{ sharing: boolean }> {
    return api.post('/discover/location', { body: { latitude, longitude } });
  },

  /**
   * The same, from a city instead of the device.
   *
   * For anyone who will not grant a location permission, and for the desktop
   * browser, where the prompt is more intrusive and less useful than typing a
   * city. Precision is the city, which is all the screen ever shows anyway.
   *
   * Still publishes a position: naming a place makes you findable on the same
   * terms as the people you can see.
   */
  shareLocationPlace(location: string): Promise<{ sharing: boolean; place: string }> {
    return api.post('/discover/location', { body: { location } });
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
    /** Measure from this city rather than from where the caller is. */
    location?: string,
  ): Promise<{ sharing: boolean; people: NearbyPerson[]; place?: string }> {
    return api.get('/discover/nearby', {
      query: {
        radiusKm,
        ...(roles.length > 0 ? { roles: roles.join(',') } : {}),
        ...(location ? { location } : {}),
      },
    });
  },

  /**
   * How many people nearby do each role.
   *
   * Unaffected by the current filter on purpose — these are the counts you
   * choose from, so they must not collapse to zero once a chip is picked.
   */
  nearbyRoleCounts(
    radiusKm = 50,
    location?: string,
  ): Promise<Record<string, number>> {
    return api.get('/discover/nearby/roles', {
      query: { radiusKm, ...(location ? { location } : {}) },
    });
  },
};
