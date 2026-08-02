import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { discoverApi } from '@/api';

export const nearbyKeys = {
  status: ['discover', 'location'] as const,
  nearby: (radiusKm: number) => ['discover', 'nearby', radiusKm] as const,
};

/** Whether the caller is discoverable, and when they last updated. */
export function useLocationSharing() {
  const query = useQuery({
    queryKey: nearbyKeys.status,
    queryFn: () => discoverApi.locationStatus(),
  });
  return { ...query, sharing: query.data?.sharing ?? false };
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
 * Turns sharing on: asks the browser for permission, reads the position, and
 * sends it up.
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

export function useStopSharingLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => discoverApi.stopSharing(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discover'] });
    },
  });
}

/** People nearby. Returns `sharing: false` rather than failing when opted out. */
export function useNearbyPeople(radiusKm = 50) {
  const query = useQuery({
    queryKey: nearbyKeys.nearby(radiusKm),
    queryFn: () => discoverApi.nearby(radiusKm),
  });
  return {
    ...query,
    people: query.data?.people ?? [],
    sharing: query.data?.sharing ?? false,
  };
}
