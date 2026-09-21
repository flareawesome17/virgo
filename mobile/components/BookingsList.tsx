import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { CalendarIcon, FileTextIcon, MapPinIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { useBookings, useTheme } from '@/src/hooks';
import { rateLabel, type Booking } from '@/src/api';
import { LoadFailed } from '@/components/LoadFailed';
import { PALETTES } from '@/theme';

const interop = { className: { target: 'style', nativeStyleToProp: { color: true } } } as const;
cssInterop(CalendarIcon, interop);
cssInterop(FileTextIcon, interop);
cssInterop(MapPinIcon, interop);

/**
 * Where a booking stands, in words that say whose move it is.
 *
 * "Pending" told nobody anything: the poster writes the terms and the
 * creative agrees to them, so the useful thing to say is which of the two is
 * being waited on.
 */
function standing(booking: Booking): { label: string; className: string; text: string } {
  if (booking.cancelledAt) return { label: 'Cancelled', className: 'bg-muted', text: 'text-muted-foreground' };
  if (booking.confirmed) return { label: 'Agreed', className: 'bg-success/15', text: 'text-success' };
  return booking.yourSide === 'creative'
    ? { label: 'Needs your yes', className: 'bg-warning/15', text: 'text-warning' }
    : { label: 'Waiting for their yes', className: 'bg-muted', text: 'text-muted-foreground' };
}

function day(iso: string | null): string | null {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: y === new Date().getFullYear() ? undefined : 'numeric',
  });
}

/**
 * Every booking you are on, either side.
 *
 * The phone could open a booking from a notification or an accepted
 * application, and had no way to find one again afterwards — the web app has
 * listed them since bookings existed. Cancelled ones stay, as they do there:
 * a booking that fell through is part of what happened.
 */
export function BookingsList({ bottomPadding = 40 }: { bottomPadding?: number }) {
  const { bookings, isLoading, loadFailed, refetch } = useBookings();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const [refreshing, setRefreshing] = useState(false);

  if (isLoading && bookings.length === 0) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator color={palette.primary} />
      </View>
    );
  }
  if (loadFailed && bookings.length === 0) {
    return <LoadFailed what="your bookings" onRetry={() => void refetch()} />;
  }
  if (bookings.length === 0) {
    return (
      <View className="flex-1 items-center justify-center px-10">
        <View className="w-14 h-14 rounded-full bg-muted items-center justify-center">
          <FileTextIcon size={24} className="text-muted-foreground" />
        </View>
        <Text className="text-foreground text-base font-bold mt-4">No bookings yet</Text>
        <Text className="text-muted-foreground text-sm text-center mt-1 leading-5">
          One is made when a job application is accepted, from either side. It holds the role, the day and the rate, so neither of you has to remember them.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: 20, paddingBottom: bottomPadding, gap: 10 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await refetch();
            setRefreshing(false);
          }}
          tintColor={palette.primary}
        />
      }
    >
      {bookings.map((booking) => {
        const state = standing(booking);
        const when = day(booking.eventDate);
        const rate = rateLabel(booking.rateMinor, booking.currency);
        return (
          <Pressable
            key={booking.id}
            onPress={() => router.push(`/bookings/${booking.id}`)}
            accessibilityRole="button"
            accessibilityLabel={`${booking.postTitle}, with ${booking.otherParty.displayName}, ${state.label}`}
            className={`rounded-2xl border border-border bg-card p-4 gap-3 active:opacity-80 ${booking.cancelledAt ? 'opacity-70' : ''}`}
          >
            <View className="flex-row items-center gap-3">
              {booking.otherParty.avatarUrl ? (
                <Image source={{ uri: booking.otherParty.avatarUrl }} className="w-10 h-10 rounded-full bg-muted" />
              ) : (
                <View className="w-10 h-10 rounded-full bg-primary/15 items-center justify-center">
                  <Text className="text-primary text-sm font-bold">
                    {booking.otherParty.displayName.slice(0, 1).toUpperCase()}
                  </Text>
                </View>
              )}
              <View className="flex-1 min-w-0">
                <Text className="text-foreground text-[15px] font-bold" numberOfLines={1}>
                  {booking.postTitle}
                </Text>
                <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>
                  {booking.role ? `${booking.role} · ` : ''}with {booking.otherParty.displayName}
                </Text>
              </View>
              <View className={`rounded-md px-2 py-1 ${state.className}`}>
                <Text className={`text-[11px] font-bold ${state.text}`}>{state.label}</Text>
              </View>
            </View>

            {(when || booking.location || rate) && (
              <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1.5">
                {when && (
                  <View className="flex-row items-center gap-1.5">
                    <CalendarIcon size={13} className="text-muted-foreground" />
                    <Text className="text-foreground text-xs">{when}</Text>
                  </View>
                )}
                {booking.location && (
                  <View className="flex-row items-center gap-1.5 flex-shrink">
                    <MapPinIcon size={13} className="text-muted-foreground" />
                    <Text className="text-foreground text-xs" numberOfLines={1}>{booking.location}</Text>
                  </View>
                )}
                {rate && <Text className="text-foreground text-xs font-semibold ml-auto">{rate}</Text>}
              </View>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
