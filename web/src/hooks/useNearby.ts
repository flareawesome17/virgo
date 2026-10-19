import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { discoverApi } from '@/api';

export const nearbyKeys = {
  status: ['discover', 'location'] as const,
  // `place` is part of the key: the same radius measured from a different city
  // is a different question, and sharing a cache entry between the two would
  // show the wrong list for a moment on every switch.
  nearby: (radiusKm: number, roles: string[] = [], place = '') =>
    ['discover', 'nearby', radiusKm, roles.join(','), place] as const,
  roleCounts: (radiusKm: number, place = '') =>
    ['discover', 'nearby', 'role-counts', radiusKm, place] as const,
};

/**
 * How the caller is placed in Nearby: whether they appear, what places them,
 * and whether they have hidden.
 */
export function useLocationSharing() {
  const query = useQuery({
    queryKey: nearbyKeys.status,
    queryFn: () => discoverApi.locationStatus(),
  });
  const data = query.data;
  return {
    ...query,
    /** Failed *or* paused — an offline device never reaches `isError`. */
    loadFailed: query.isError || query.isPaused,
    /** Whether they appear in Nearby: placed by something, and not hidden. */
    sharing: data?.sharing ?? false,
    /** The place they are shown at, or null for a device position. */
    place: data?.place ?? null,
    /**
     * What places them — device, picked city or address — and null when
     * nothing does. Undefined from an older API, which placed nobody by
     * their address; the screens fall back to `sharing` for that.
     */
    source: data?.source,
    /** Left out of everyone else's Nearby by their own choice. */
    hidden: data?.hidden ?? false,
    /** Where the address on the profile resolved to, if it did. */
    addressPlace: data?.addressPlace ?? null,
    /**
     * Whether the device's position is shared, fresh or not. An older API
     * says only "sharing, and no picked city", which meant the same.
     */
    exactLocation:
      data?.shared !== undefined
        ? data.shared === 'gps'
        : !!data?.sharing && !data?.place,
    /** Shared, but over 30 days old, so the address's city places them instead. */
    exactLocationStale: data?.shared === 'gps' && data?.source !== 'gps',
    /** When the shared position was set; a device one stops counting after 30 days. */
    updatedAt: data?.updatedAt ?? null,
  };
}

/**
 * Reads the browser's position.
 *
 * `enableHighAccuracy: false` on purpose — a few hundred metres is plenty for
 * a distance in kilometres, and the high-accuracy path is slower, drains the
 * battery, and on a laptop often just falls back to the same network lookup.
 */
function currentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('This browser cannot share a location.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, (err) => {
      // The browser's own messages are terse and often blank, so each case
      // gets a sentence that says what to actually do about it.
      if (err.code === err.PERMISSION_DENIED) {
        reject(
          new Error(
            'Location is blocked for this site. Allow it in your browser settings, then try again.',
          ),
        );
        return;
      }
      if (err.code === err.POSITION_UNAVAILABLE) {
        reject(new Error('Your location could not be determined right now.'));
        return;
      }
      reject(new Error('Getting your location took too long. Try again.'));
    }, {
      enableHighAccuracy: false,
      timeout: 15_000,
      // A fix from the last five minutes is fine for a distance in km, and
      // avoids re-prompting the hardware for something that has not changed.
      maximumAge: 300_000,
    });
  });
}

/**
 * "Use my exact location": asks the browser for permission, reads the
 * position, and sends it up. It places the caller more closely than their
 * city does; it does not decide whether they are shown.
 *
 * Permission and the app-level opt-in are separate on purpose. Granting the
 * browser prompt should not by itself publish someone's location to other
 * users, so this is only ever called from an explicit toggle.
 */
export function useShareLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const position = await currentPosition();
      return discoverApi.shareLocation(
        position.coords.latitude,
        position.coords.longitude,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discover'] });
    },
  });
}

/**
 * Shows or hides the caller in everyone else's Nearby.
 *
 * Hiding keeps the address and any shared position, so showing again puts
 * them straight back; it does not stop them searching.
 */
export function useSetNearbyHidden() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (hidden: boolean) => discoverApi.setHidden(hidden),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discover'] });
    },
  });
}

/**
 * Erases the shared position, device or picked city. The caller is placed by
 * their address's city again — this does not hide them.
 */
export function useStopSharingLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => discoverApi.stopSharing(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discover'] });
    },
  });
}

/**
 * People nearby, optionally only those who do a particular job.
 *
 * `origin` is null rather than an error when there is nowhere to measure
 * from — no address city, no shared position, no typed city — so the screen
 * can ask for a city instead of showing a failure.
 *
 * `placeholderData` keeps the previous list on screen while a new filter
 * loads, so toggling a role chip does not blink the screen empty.
 */
export function useNearbyPeople(
  radiusKm = 50,
  roles: string[] = [],
  /** Search from this city instead of from where the caller is. */
  place = '',
) {
  const query = useQuery({
    queryKey: nearbyKeys.nearby(radiusKm, roles, place),
    queryFn: () => discoverApi.nearby(radiusKm, roles, place || undefined),
    placeholderData: (previous) => previous,
  });
  return {
    ...query,
    /** Failed *or* paused — an offline device never reaches `isError`. */
    loadFailed: query.isError || query.isPaused,
    people: query.data?.people ?? [],
    sharing: query.data?.sharing ?? false,
    /** Echoed back by the API, so the screen names the place it searched. */
    searchedPlace: query.data?.place ?? null,
    /**
     * Where the search measured from; null when there was nowhere, undefined
     * before an answer or from an older API.
     */
    origin: query.data?.origin,
  };
}

/**
 * How many people nearby do each role.
 *
 * Deliberately not narrowed by the active filter: these are the counts you
 * choose from, and narrowing them would zero every other chip the moment one
 * was picked.
 */
export function useNearbyRoleCounts(radiusKm = 50, place = '') {
  const query = useQuery({
    queryKey: nearbyKeys.roleCounts(radiusKm, place),
    queryFn: () => discoverApi.nearbyRoleCounts(radiusKm, place || undefined),
  });
  return {
    ...query,
    /** Failed *or* paused — an offline device never reaches `isError`. */
    loadFailed: query.isError || query.isPaused,
    counts: query.data ?? {},
  };
}
