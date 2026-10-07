import { api } from '../client';

export interface NearbyPerson {
  id: string;
  name: string;
  avatarUrl: string | null;
  /** Kilometres. The API never returns anyone else's coordinates. */
  distanceKm: number;
  /**
   * True when the distance is to a city centre — their address's city, or
   * one they picked — rather than to a device position. Say "In Cebu City"
   * for these, not a precise-looking number of kilometres.
   *
   * Optional, like `place`: an older API, or a list cached before it, has
   * neither, and reads as a device distance, which is what it was.
   */
  approximate?: boolean;
  /** The city or province an approximate position is; null for a device one. */
  place?: string | null;
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

/** What places somebody in Nearby: their device, a city they picked, or their address. */
export type NearbySource = 'gps' | 'place' | 'address';

export interface LocationStatus {
  /**
   * Whether you appear in Nearby: placed by something, and not hidden.
   *
   * The installed apps read this as "sharing my location" — which is why it
   * covers the address too, so none of them tells somebody in everyone's
   * results that they are not discoverable.
   */
  sharing: boolean;
  /** When the shared position was set; a device one stops counting after 30 days. */
  updatedAt: string | null;
  /**
   * The name of the place you are shown at — a picked city or your address's
   * — or null for a device position. Optional so a response from an older
   * API does not read as "GPS".
   */
  place?: string | null;
  /*
   * The four below are optional: an older API sends none of them. Read them
   * with a fallback, and treat their absence as "the old rules".
   */
  /** What places you, hidden or not; null when nothing does. */
  source?: NearbySource | null;
  /** Left out of everyone else's Nearby by your own choice. */
  hidden?: boolean;
  /** Where the address on your profile resolved to, if it did. */
  addressPlace?: string | null;
  /**
   * What you have shared, whether or not it still counts. 'gps' while
   * `source` is 'address' means the device position is over 30 days old.
   */
  shared?: 'gps' | 'place' | null;
}

/** Where a search was measured from. `search` is a city typed into "Near". */
export interface NearbyOrigin {
  source: NearbySource | 'search';
  /** Null for a device position, which has no name. */
  place: string | null;
}

export interface NearbyResult {
  /** True whenever there was somewhere to measure from. */
  sharing: boolean;
  people: NearbyPerson[];
  /** The typed city the search measured from, when there was one. */
  place?: string;
  /**
   * Where the search measured from, and null when there was nowhere: no
   * address city, no shared position, no typed city. Absent from an older
   * API, which answered `sharing: false` for that instead.
   */
  origin?: NearbyOrigin | null;
}

/**
 * Nearby collaborator discovery.
 *
 * Everyone with an address appears at their city's centre — never the street
 * — unless they hide. Sharing the device's position is optional and only
 * makes the match closer. Anyone can search, from wherever they are placed or
 * from a city they type.
 */
export const discoverApi = {
  locationStatus(): Promise<LocationStatus> {
    return api.get('/discover/location');
  },

  /** Stores the position from the device. Does not change whether you are shown. */
  shareLocation(latitude: number, longitude: number): Promise<LocationStatus> {
    return api.post('/discover/location', { body: { latitude, longitude } });
  },

  /**
   * Erases the shared position, device or picked city. You are placed by
   * your address's city again; this does not hide you.
   */
  stopSharing(): Promise<LocationStatus> {
    return api.delete('/discover/location');
  },

  /** Shows or hides you in everyone else's Nearby. Searching is unaffected. */
  setHidden(hidden: boolean): Promise<LocationStatus> {
    return api.post('/discover/visibility', { body: { hidden } });
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
  ): Promise<NearbyResult> {
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
