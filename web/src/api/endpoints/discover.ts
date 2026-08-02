import { api } from '../client';

export interface NearbyPerson {
  id: string;
  name: string;
  avatarUrl: string | null;
  /** Kilometres. The API never returns anyone else's coordinates. */
  distanceKm: number;
  relationship: 'none' | 'pending_out' | 'pending_in' | 'accepted';
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

  nearby(radiusKm = 50): Promise<{ sharing: boolean; people: NearbyPerson[] }> {
    return api.get('/discover/nearby', { query: { radiusKm } });
  },
};
