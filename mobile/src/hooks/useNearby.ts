import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { discoverApi } from '@/src/api';

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

/** Whether the caller is discoverable, and when they last updated. */
export function useLocationSharing() {
  const query = useQuery({
    queryKey: nearbyKeys.status,
    queryFn: () => discoverApi.locationStatus(),
  });
  return {
    ...query,
    /** Failed *or* paused — an offline device never reaches `isError`. */
    loadFailed: query.isError || query.isPaused,
    sharing: query.data?.sharing ?? false,
    /** The city they picked, or null when the position came from the device. */
    place: query.data?.place ?? null,
  };
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

/**
 * Turns sharing on from a named city instead of the device.
 *
 * The way in for anyone who will not grant a location permission — and on a
 * desktop browser, usually the better one: the prompt there is more intrusive
 * and the answer less accurate than simply saying which city you work in.
 *
 * Still an explicit opt-in, and still reciprocal: naming a place publishes an
 * approximate position, so it makes you findable on the same terms as the
 * people it lets you find.
 */
export function useSetLocationPlace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (place: string) => discoverApi.shareLocationPlace(place),
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

/**
 * People nearby, optionally only those who do a particular job.
 *
 * Returns `sharing: false` rather than failing when opted out.
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
