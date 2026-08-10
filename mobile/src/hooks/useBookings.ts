import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { bookingsApi, queryKeys, type BookingPatch } from '@/src/api';

/**
 * The bookings you are on, either side.
 *
 * Arrives over the `booking` realtime topic as well, so a confirmation from
 * the other person appears without a refresh — which matters, because the
 * whole flow is two people taking turns.
 */
export function useBookings(enabled = true) {
  const query = useQuery({
    queryKey: queryKeys.bookings.list,
    queryFn: () => bookingsApi.list(),
    enabled,
  });
  return {
    ...query,
    bookings: query.data ?? [],
    /** Failed *or* paused — an offline device never reaches `isError`. */
    loadFailed: query.isError || query.isPaused,
  };
}

export function useBooking(id: string) {
  const query = useQuery({
    queryKey: queryKeys.bookings.detail(id),
    queryFn: () => bookingsApi.byId(id),
    enabled: !!id,
  });
  return {
    ...query,
    booking: query.data,
    loadFailed: query.isError || query.isPaused,
  };
}

/** Invalidates both the list and the one row every booking write touches. */
function useBookingMutation<TArgs>(
  id: string,
  fn: (args: TArgs) => Promise<unknown>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
    },
  });
}

/**
 * Changing the terms un-agrees them.
 *
 * Both confirmations are cleared server-side, which is the point of the
 * feature rather than a side effect — so the UI must not pretend the booking
 * is still agreed while this is in flight.
 */
export function useUpdateBooking(id: string) {
  return useBookingMutation(id, (patch: BookingPatch) =>
    bookingsApi.update(id, patch),
  );
}

export function useConfirmBooking(id: string) {
  return useBookingMutation(id, () => bookingsApi.confirm(id));
}

export function useCancelBooking(id: string) {
  return useBookingMutation(id, (reason?: string) =>
    bookingsApi.cancel(id, reason),
  );
}
