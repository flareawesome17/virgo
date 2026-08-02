import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { discoverApi } from '@/src/api';

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
 * Turns sharing on: asks the OS for permission, reads the position, and sends
 * it up.
 *
 * Permission and the app-level opt-in are separate on purpose. Granting the OS
 * prompt should not by itself publish someone's location to other users, so
 * this is only ever called from an explicit toggle.
 */
export function useShareLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!granted) {
        throw new Error(
          'Location permission is needed to find collaborators near you.',
        );
      }
      // Balanced accuracy: a few hundred metres is plenty for a distance in km,
      // and asking for the highest accuracy costs battery for no visible gain.
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
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
